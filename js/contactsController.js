function ContactsController (optionsController, timeFilterController, searchController) {
    this.contact_MARKER_VIEW_SIZE = 40;
    this.contactLayer = null;
    this.contactsDataLoaded = false;
    this.contactsRequestInProgress = false;
    this.optionsController = optionsController;
    this.timeFilterController = timeFilterController;
    this.searchController = searchController;
    this.contactMarkers = [];
    this.contactMarkersOldest = null;
    this.contactMarkersNewest = null;
    this.contactMarkersFirstVisible = 0;
    this.contactMarkersLastVisible = -1;
    this.timeFilterBegin = 0;
    this.timeFilterEnd = Date.now();

    this.movingBookid = null;
    this.movingUri = null;
    this.movingUid = null;
}

ContactsController.prototype = {

    initLayer : function(map) {
        this.map = map;
        var that = this;
        this.contactLayer = L.markerClusterGroup({
            iconCreateFunction : this.getClusterIconCreateFunction(),
            spiderfyOnMaxZoom: false,
            showCoverageOnHover : false,
            zoomToBoundsOnClick: false,
            maxClusterRadius: this.contact_MARKER_VIEW_SIZE + 10,
            icon: {
                iconSize: [this.contact_MARKER_VIEW_SIZE, this.contact_MARKER_VIEW_SIZE]
            }
        });
        this.contactLayer.on('click', this.getContactMarkerOnClickFunction());
        this.contactLayer.on('clusterclick', function (a) {
            if (a.layer.getChildCount() > 20 && that.map.getZoom() !== that.map.getMaxZoom()) {
                a.layer.zoomToBounds();
            }
            else {
                a.layer.spiderfy();
                that.map.clickpopup = true;
            }
        });
        // click on contact menu entry
        $('body').on('click', '#navigation-contacts > a', function(e) {
            that.toggleLayer();
            that.optionsController.saveOptionValues({contactLayer: that.map.hasLayer(that.contactLayer)});
            that.updateTimeFilterRange();
            that.timeFilterController.setSliderToMaxInterval();
        });
        // delete address
        $('body').on('click', '.deleteContactAddress', function(e) {
            var ul = $(this).parent().parent();
            var bookid = ul.attr('bookid');
            var uri = ul.attr('uri');
            var uid = ul.attr('uid');
            var vcardAddress = ul.attr('vcardaddress');
            that.deleteContactAddress(bookid, uri, uid, vcardAddress);
        });
        $('body').on('click', '#submitPlaceContactButton', function(e) {
            that.submitPlaceContact();
        });
    },

    updateMyFirstLastDates: function() {
        var layerVisible = this.map.hasLayer(this.contactLayer);
        var nbMarkers = this.contactMarkers.length;
        this.contactMarkersOldest = (layerVisible && nbMarkers > 0) ? this.contactMarkers[0].data.date : null;
        this.contactMarkersNewest = (layerVisible && nbMarkers > 0) ? this.contactMarkers[nbMarkers - 1].data.date : null;
    },

    showLayer: function() {
        if (!this.contactsDataLoaded && !this.contactsRequestInProgress) {
            this.callForContacts();
        }
        if (!this.map.hasLayer(this.contactLayer)) {
            this.map.addLayer(this.contactLayer);
        }
    },

    hideLayer: function() {
        if (this.map.hasLayer(this.contactLayer)) {
            this.map.removeLayer(this.contactLayer);
        }
    },

    toggleLayer: function() {
        if (this.map.hasLayer(this.contactLayer)) {
            this.hideLayer();
            $('#navigation-contacts').removeClass('active');
            $('#map').focus();
        } else {
            this.showLayer();
            $('#navigation-contacts').addClass('active');
        }
    },

    getContactMarkerOnClickFunction: function() {
        var _app = this;
        return function(evt) {
            var marker = evt.layer;
            var contactPopup = marker.data.tooltipContent;
            var contactUrl = OC.generateUrl('/apps/contacts/'+t('contacts', 'All contacts')+'/'+encodeURIComponent(marker.data.uid+"~contacts"));
            contactPopup += '<a href="'+contactUrl+'" target="_blank">'+t('maps', 'Open in Contacts app')+'</a>';
            marker.unbindPopup();
            marker.bindPopup(contactPopup, {
                closeOnClick: true,
                className: 'popovermenu open popupMarker contactPopup',
                offset: L.point(-5, -19)
            });
            marker.openPopup();
            this._map.clickpopup = true;
        };
    },

    getClusterIconCreateFunction: function() {
        var _app = this;
        return function(cluster) {
            var marker = cluster.getAllChildMarkers()[0].data;
            var iconUrl = marker.avatar;
            var label = cluster.getChildCount();
            return new L.DivIcon(L.extend({
                className: 'leaflet-marker-contact cluster-marker',
                html: '<div class="thumbnail" style="background-image: url(' + iconUrl + ');"></div>​<span class="label">' + label + '</span>'
            }, this.icon));
        };
    },

    createContactView: function(markerData) {
        var avatar = markerData.avatar;
        //this.generatePreviewUrl(markerData.path);
        return L.divIcon(L.extend({
            html: '<div class="thumbnail" style="background-image: url(' + avatar + ');"></div>​',
            className: 'leaflet-marker-contact contact-marker'
        }, markerData, {
            iconSize: [this.contact_MARKER_VIEW_SIZE, this.contact_MARKER_VIEW_SIZE],
            iconAnchor:   [this.contact_MARKER_VIEW_SIZE / 2, this.contact_MARKER_VIEW_SIZE]
        }));
    },

    addContactsToMap : function(contacts) {
        var markers = this.prepareContactMarkers(contacts);
        this.contactMarkers.push.apply(this.contactMarkers, markers);
        this.contactMarkers.sort(function (a, b) { return a.data.date - b.data.date;});

        // we put them all in the layer
        this.contactMarkersFirstVisible = 0;
        this.contactMarkersLastVisible = this.contactMarkers.length - 1;
        this.contactLayer.addLayers(this.contactMarkers);

        this.updateTimeFilterRange();
        this.timeFilterController.setSliderToMaxInterval();
    },

    prepareContactMarkers : function(contacts) {
        var markers = [];
        for (var i = 0; i < contacts.length; i++) {

            var geo = [];
            if (contacts[i].GEO.substr(0,4) === "geo:") {
                geo = contacts[i].GEO.substr(4).split(",");
            } else {
                geo = contacts[i].GEO.split(";");
            }
            var date;
            if (contacts[i].hasOwnProperty('REV')) {
                date = Date.parse(contacts[i].REV);
            }
            else {
                date = new Date();
            }
            if (isNaN(date)) {
                var year = parseInt(contacts[i].REV.substr(0,4));
                var month = parseInt(contacts[i].REV.substr(4,2))-1;
                var day = parseInt(contacts[i].REV.substr(6,2))-1;
                var hour = parseInt(contacts[i].REV.substr(9,2))-1;
                var min = parseInt(contacts[i].REV.substr(11,2))-1;
                var sec = parseInt(contacts[i].REV.substr(13,2))-1;
                date = new Date(year,month,day,hour,min,sec);
                date = date.getTime();
            }

            // format address
            var adrTab = contacts[i].ADR.split(';');
            var formattedAddress = '';
            if (adrTab.length > 6) {
                formattedAddress = adrTab[2] + '<br/>' + adrTab[5] + ' ' + adrTab[3] + '<br/>' + adrTab[4] + ' ' + adrTab[6];
            }

            var markerData = {
                name: contacts[i].FN,
                lat: parseFloat(geo[0]),
                lng: parseFloat(geo[1]),
                uid: contacts[i].UID,
                uri: contacts[i].URI,
                adr: contacts[i].ADR,
                has_photo: contacts[i].HAS_PHOTO,
                address: formattedAddress,
                addressType: contacts[i].ADRTYPE.toLowerCase(),
                bookid: contacts[i].BOOKID,
                bookuri: contacts[i].BOOKURI,
                date: date/1000,
            };
            if (contacts[i].HAS_PHOTO) {
                markerData.avatar = this.generateAvatar(markerData) || this.getUserImageIconUrl();
            }
            else {
                markerData.avatar = this.getLetterAvatarUrl(basename(markerData.name));
            }

            var marker = L.marker([markerData.lat, markerData.lng], {
                icon: this.createContactView(markerData)
            });

            marker.on('contextmenu', this.onContactRightClick);
            marker.data = markerData;
            var contactTooltip = '<p class="tooltip-contact-name">' + escapeHTML(basename(markerData.name)) + '</p>';
            var img = '<img class="tooltip-contact-avatar" src="' + markerData.avatar + '"/>';
            contactTooltip += img;
            if (markerData.addressType === 'home') {
                contactTooltip += '<p class="tooltip-contact-address-type"><b>'+t('maps', 'Home')+'</b></p>';
            }
            else if (markerData.addressType === 'work') {
                contactTooltip += '<p class="tooltip-contact-address-type"><b>'+t('maps', 'Work')+'</b></p>';
            }
            contactTooltip += '<p class="tooltip-contact-address">' + markerData.address + '</p>';
            markerData.tooltipContent = contactTooltip;

            marker.bindTooltip(contactTooltip, {permanent: false, className: 'leaflet-marker-contact-tooltip', direction: 'top', offset: L.point(0, -25)});
            markers.push(marker);
        }
        return markers;
    },

    onContactRightClick: function(e) {
        var data = e.target.data;
        var bookid = data.bookid;
        var uri = data.uri;
        var uid = data.uid;
        var vcardAddress = data.adr;

        e.target.unbindPopup();
        var popupContent = this._map.contactsController.getContactContextPopupContent(bookid, uri, uid, vcardAddress);
        e.target.bindPopup(popupContent, {
            closeOnClick: true,
            className: 'popovermenu open popupMarker',
            offset: L.point(-5, -19)
        });
        e.target.openPopup();
        this._map.clickpopup = true;
    },

    getContactContextPopupContent: function(bookid, uri, uid, vcardAddress) {
        var deleteText = t('maps', 'Delete this address');
        var res =
            '<ul bookid="' + bookid + '" uri="' + uri + '" uid="' + uid + '" vcardaddress="' + vcardAddress + '">' +
            '   <li>' +
            '       <button class="icon-delete deleteContactAddress">' +
            '           <span>' + deleteText + '</span>' +
            '       </button>' +
            '   </li>' +
            '</ul>';
        return res;
    },

    deleteContactAddress: function(bookid, uri, uid, vcardAddress) {
        var that = this;
        $('#navigation-contacts').addClass('icon-loading-small');
        $('.leaflet-container').css('cursor', 'wait');
        var req = {
            uid: uid,
            adr: vcardAddress
        };
        var url = OC.generateUrl('/apps/maps/contacts/'+bookid+'/'+uri);
        $.ajax({
            type: 'DELETE',
            url: url,
            data: req,
            async: true
        }).done(function (response) {
        }).always(function (response) {
            that.map.closePopup();
            that.map.clickpopup = null;
            $('#navigation-contacts').removeClass('icon-loading-small');
            $('.leaflet-container').css('cursor', 'grab');
            that.reloadContacts();
        }).fail(function() {
            OC.Notification.showTemporary(t('maps', 'Failed to delete contact address'));
        });
    },

    updateTimeFilterRange: function() {
        this.updateMyFirstLastDates();
        this.timeFilterController.updateSliderRangeFromController();
    },

    updateTimeFilterBegin: function (date) {
        if (date <= this.timeFilterEnd) {
            var i = this.contactMarkersFirstVisible;
            if (date < this.timeFilterBegin) {
                i = i-1;
                while (i >= 0 && i <= this.contactMarkersLastVisible && this.contactMarkers[i].data.date >= date) {
                    this.contactLayer.addLayer(this.contactMarkers[i]);
                    i = i-1;
                }
                this.contactMarkersFirstVisible = i + 1;
            }
            else {
                while (i < this.contactMarkers.length && i >= 0 && i <= this.contactMarkersLastVisible && this.contactMarkers[i].data.date < date) {
                    this.contactLayer.removeLayer(this.contactMarkers[i]);
                    i = i + 1;
                }
                this.contactMarkersFirstVisible = i;
            }
            this.timeFilterBegin = date;
        }
        else {
            this.updateTimeFilterBegin(this.timeFilterEnd);
        }
    },

    updateTimeFilterEnd: function (date){
        if (date >= this.timeFilterBegin) {
            var i = this.contactMarkersLastVisible;
            if (date < this.timeFilterEnd) {
                while (i >= 0 && i >= this.contactMarkersFirstVisible && this.contactMarkers[i].data.date > date ) {
                    this.contactLayer.removeLayer(this.contactMarkers[i]);
                    i = i-1;
                }
                this.contactMarkersLastVisible = i;
            }
            else {
                i = i+1;
                while (i >= this.contactMarkersFirstVisible && i < this.contactMarkers.length && this.contactMarkers[i].data.date <= date) {
                    this.contactLayer.addLayer(this.contactMarkers[i]);
                    i = i+1;
                }
                this.contactMarkersLastVisible = i - 1;
            }
            this.timeFilterEnd = date;
        }
        else {
            this.updateTimeFilterEnd(this.timeFilterBegin);
        }
    },

    callForContacts: function() {
        this.contactsRequestInProgress = true;
        $('#navigation-contacts').addClass('icon-loading-small');
        $.ajax({
            url: OC.generateUrl('apps/maps/contacts'),
            type: 'GET',
            async: true,
            context: this
        }).done(function (response) {
            if (response.length == 0) {
                //showNocontactsMessage();
            } else {
                this.addContactsToMap(response);
            }
            this.contactsDataLoaded = true;
        }).always(function (response) {
            this.contactsRequestInProgress = false;
            $('#navigation-contacts').removeClass('icon-loading-small');
        }).fail(function() {
            OC.Notification.showTemporary(t('maps', 'Failed to load contacts'));
        });
    },

    generateAvatar: function (data) {
        // data is supposed to be a base64 string
        // but if this is a 'user' contact, avatar is and address like
        // VALUE=uri:http://host/remote.php/dav/addressbooks/system/system/system/Database:toto.vcf?photo
        //return data ? data.replace(/^VALUE=uri:/, '') : data;
        var url = OC.generateUrl('/remote.php/dav/addressbooks/users/' + OC.getCurrentUser().uid +
                  '/' + data.bookuri + '/' + data.uri + '?photo').replace(/index\.php\//, '');
        return url;
    },

    getImageIconUrl: function() {
        return OC.generateUrl('/apps/theming/img/core/places') + '/contacts.svg?v=2';
    },

    getUserImageIconUrl: function() {
        return OC.generateUrl('/apps/theming/img/core/actions') + '/user.svg?v=2';
    },

    getLetterAvatarUrl: function(name) {
        return OC.generateUrl('/apps/maps/contacts-avatar?name='+encodeURIComponent(name));
    },

    contextPlaceContact: function(e) {
        var that = this.contactsController;
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        that.openPlaceContactPopup(lat, lng);
    },

    openPlaceContactPopup: function(lat, lng) {
        var that = this;
        var popupText = '<h3>' + t('maps', 'New contact address') + '</h3>';
        popupText += '<textarea id="placeContactPopupAddress"></textarea><br/>';
        popupText += '<button class="icon icon-user"></button>';
        popupText += '<input id="place-contact-input" placeholder="'+t('maps', 'Contact name')+'" type="text" />';
        popupText += '<button id="placeContactValidIcon" class="icon icon-checkmark"></button>';
        popupText += '<br/>';
        popupText += '<label for="addressTypeSelect">' + t('maps', 'Address type') + '</label>';
        popupText += '<select id="addressTypeSelect">';
        popupText += '<option value="home" selected>' + t('maps', 'Home') + '</option>';
        popupText += '<option value="work">' + t('maps', 'Work') + '</option>';
        popupText += '</select><br/><button id="submitPlaceContactButton">'+t('maps', 'Add address to contact')+'</button>';
        this.map.openPopup(popupText, [lat, lng]);
        this.map.clickpopup = true;

        that.currentPlaceContactAddress = null;
        that.currentPlaceContactLat = lat;
        that.currentPlaceContactLng = lng;
        that.currentPlaceContactFormattedAddress = null;
        that.currentPlaceContactContact = null;

        // get the reverse geocode address
        var strLatLng = lat+','+lng;
        that.searchController.geocode(strLatLng).then(function(results) {
            var address = {};
            if (results.address) {
                address = results.address;
                that.currentPlaceContactAddress = address;
                var strAddress = formatAddress(address);
                //console.log(address);
                $('#placeContactPopupAddress').text(strAddress);
                that.currentPlaceContactFormattedAddress = strAddress;
            }
        });
        // get the contact list
        var req = {};
        var url = OC.generateUrl('/apps/maps/contacts-all');
        $.ajax({
            type: 'GET',
            url: url,
            data: req,
            async: true
        }).done(function (response) {
            var d, c;
            var data = [];
            for (var i=0; i < response.length; i++) {
                c = response[i];
                d = {
                    id: c.URI,
                    label: c.FN,
                    value: c.FN,
                    uri: c.URI,
                    uid: c.UID,
                    bookid: c.BOOKID
                };
                data.push(d);
            }
            $('#place-contact-input').autocomplete({
                source: data,
                select: function (e, ui) {
                    var it = ui.item;
                    that.currentPlaceContactContact = ui.item;
                    $('#placeContactValidIcon').show();
                    //that.submitPlaceContactPopup(it.bookid, it.uri, it.uid, lat, lng, address, type, editedAddress);
                }
            })
            $('#place-contact-input').focus().select();
        }).always(function (response) {
        }).fail(function() {
            OC.Notification.showTemporary(t('maps', 'Failed to get contact list'));
        });
    },

    submitPlaceContact: function() {
        var that = this;
        var lat = that.currentPlaceContactLat;
        var lng = that.currentPlaceContactLng;
        var currentContact = that.currentPlaceContactContact;
        var currentAddress = that.currentPlaceContactAddress;
        var currentFormattedAddress = that.currentPlaceContactFormattedAddress;
        var bookid = currentContact.bookid;
        var uri = currentContact.uri;
        var uid = currentContact.uid;
        var editedAddress = $('#placeContactPopupAddress').val().trim().replace(/(\r\n|\n|\r)/gm, ' ').replace(/\s+/g, ' ');
        var type = $('#addressTypeSelect').val();

        $('#submitPlaceContactButton').addClass('loading');

        // we didn't change the address => place
        if (currentFormattedAddress === editedAddress) {
            that.placeContact(bookid, uri, uid, lat, lng, currentAddress, type);
            that.map.panTo([lat, lng], { animate: true });
        }
        // we changed the address, search the new one
        else {
            that.searchController.search(editedAddress, 1).then(function(results) {
                var address = {};
                //console.log(results);
                // there was a result
                if (results.length > 0 && results[0].address && results[0].lat && results[0].lon) {
                    address = results[0].address;
                    //var strAddress = formatAddress(address);
                    lat = results[0].lat;
                    lng = results[0].lon;
                }
                // nope, no result, keep the original one
                else {
                    address = currentAddress;
                }
                that.placeContact(bookid, uri, uid, lat, lng, address, type);
                if (that.map.getBounds().contains(L.latLng(lat, lng))) {
                    that.map.panTo([lat, lng], { animate: true });
                }
                else {
                    that.map.flyTo([lat, lng], 15, { animate: true });
                }
            });
        }
    },

    placeContact: function(bookid, uri, uid, lat, lng, address, type='home') {
        var that = this;
        $('#navigation-contacts').addClass('icon-loading-small');
        $('.leaflet-container').css('cursor', 'wait');
        var road = (address.road || '') + ' ' + (address.pedestrian || '') + ' ' + (address.suburb || '') + ' ' + (address.city_district || '');
        road = road.replace(/\s+/g, ' ').trim();
        var city = address.village || address.town || address.city;
        city = city.replace(/\s+/g, ' ').trim();
        var req = {
            lat: lat,
            lng: lng,
            uid: uid,
            attraction: address.attraction,
            house_number: address.house_number,
            road: road,
            postcode: address.postcode,
            city: city,
            state: address.state,
            country: address.country,
            type: type
        };
        var url = OC.generateUrl('/apps/maps/contacts/'+bookid+'/'+uri);
        $.ajax({
            type: 'PUT',
            url: url,
            data: req,
            async: true
        }).done(function (response) {
        }).always(function (response) {
            that.map.closePopup();
            that.map.clickpopup = null;
            $('#navigation-contacts').removeClass('icon-loading-small');
            $('.leaflet-container').css('cursor', 'grab');
            that.reloadContacts();
        }).fail(function() {
            OC.Notification.showTemporary(t('maps', 'Failed to place contact'));
        });
    },

    reloadContacts: function() {
        this.contactsDataLoaded = false;
        this.contactsRequestInProgress = false;

        for (var i=0; i < this.contactMarkers.length; i++) {
            this.contactLayer.removeLayer(this.contactMarkers[i]);
        }

        this.contactMarkers = [];
        this.contactMarkersOldest = null;
        this.contactMarkersNewest = null;
        this.contactMarkersFirstVisible = 0;
        this.contactMarkersLastVisible = -1;
        this.timeFilterBegin = 0;
        this.timeFilterEnd = Date.now();

        this.showLayer();
    },

    getAutocompData: function() {
        var that = this;
        var mData;
        var data = [];
        if (this.map.hasLayer(this.contactLayer)) {
            this.contactLayer.eachLayer(function (l) {
                mData = l.data;
                data.push({
                    type: 'contact',
                    label: mData.name,
                    value: mData.name,
                    lat: mData.lat,
                    lng: mData.lng
                });
            });
        }
        return data;
    },

};