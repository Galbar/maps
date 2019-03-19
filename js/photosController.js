function PhotosController () {
    this.PHOTO_MARKER_VIEW_SIZE = 40;
    this.photosDataLoaded = false;
    this.photosRequestInProgress = false;
}
 
PhotosController.prototype = {

    appendToMap : function(map) {
        this.map = map;
        this.photoLayer = L.markerClusterGroup({
            iconCreateFunction : this.getClusterIconCreateFunction(),
            showCoverageOnHover : false,
            maxClusterRadius: this.PHOTO_MARKER_VIEW_SIZE + 10,
            icon: {						
                iconSize: [this.PHOTO_MARKER_VIEW_SIZE, this.PHOTO_MARKER_VIEW_SIZE]
			}
        });
        this.photoLayer.on('click', this.getPhotoMarkerOnClickFunction());
        this.photoLayer.addTo(this.map);
    },

    showLayer: function() {
        if (!this.photosDataLoaded && !this.photosRequestInProgress) {
            this.callForImages();
        }
        if (!this.map.hasLayer(this.photoLayer)) {
            this.map.addLayer(this.photoLayer);
        }
    },

    hideLayer: function() {
        if (this.map.hasLayer(this.photoLayer)) {
            this.map.removeLayer(this.photoLayer);
        }
    },

    getPhotoMarkerOnClickFunction() {
        var _app = this;
        return function(evt) {
            var marker = evt.layer;
            var content;
            if (marker.data.hasPreview) {
                var previewUrl = _app.generatePreviewUrl(marker.data.path);
                var img = "<img src=" + previewUrl + "/>";
                //Workaround for https://github.com/Leaflet/Leaflet/issues/5484
                $(img).on('load', function() {
                    marker.getPopup().update();
                });
                content = img;
            } else {
                content = marker.data.path;
            }
            marker.bindPopup(content, {
                className: 'leaflet-popup-photo',
                maxWidth: "auto"
            }).openPopup();
        }
    },

    getClusterIconCreateFunction() {
        var _app = this;
        return function(cluster) {
            var marker = cluster.getAllChildMarkers()[0].data;
            var iconUrl;
            if (marker.hasPreview) {
                iconUrl = _app.generatePreviewUrl(marker.path);
            } else {
                iconUrl = _app.getImageIconUrl();
            }
            var label = cluster.getChildCount();
            return new L.DivIcon(L.extend({
                className: 'leaflet-marker-photo cluster-marker', 
                html: '<div class="thumbnail" style="background-image: url(' + iconUrl + ');"></div>​<span class="label">' + label + '</span>'
            }, this.icon));
        }
    },

    createPhotoView: function(markerData) {
        var iconUrl;
        if (markerData.hasPreview) {
            iconUrl = this.generatePreviewUrl(markerData.path);
        } else {
            iconUrl = this.getImageIconUrl();
        }
        this.generatePreviewUrl(markerData.path);
        return L.divIcon(L.extend({
            html: '<div class="thumbnail" style="background-image: url(' + iconUrl + ');"></div>​',
            className: 'leaflet-marker-photo photo-marker'
        }, markerData, {						
            iconSize: [this.PHOTO_MARKER_VIEW_SIZE, this.PHOTO_MARKER_VIEW_SIZE],
            iconAnchor:   [this.PHOTO_MARKER_VIEW_SIZE / 2, this.PHOTO_MARKER_VIEW_SIZE]
        }));
    },

    addPhotosToMap : function(photos) {
        var markers = this.preparePhotoMarkers(photos);
        this.photoLayer.addLayers(markers);
    },

    preparePhotoMarkers : function(photos) {
        var markers = [];
        for (var i = 0; i < photos.length; i++) {
            var markerData = {
                lat: photos[i].lat,
                lng: photos[i].lng,
                path: photos[i].path,
                albumId: photos[i].folderId,
                hasPreview : photos[i].hasPreview
            };
            var marker = L.marker(markerData, {
                icon: this.createPhotoView(markerData)
            });
            marker.data = markerData;
            markers.push(marker);
        }
        return markers;
    },

    callForImages: function() {
        this.photosRequestInProgress = true;
        $.ajax({
            'url' : OC.generateUrl('apps/maps/photos'),
            'type': 'GET',
            'context' : this,
            'success': function(response) {
                if (response.length == 0) {
                    //showNoPhotosMessage();
                } else {
                    this.addPhotosToMap(response);
                }
                this.photosDataLoaded = true;
            },
            'complete': function(response) {
                this.photosRequestInProgress = false;
            }
        });
    },
    
    /* Preview size 32x32 is used in files view, so it sould be generated */
    generateThumbnailUrl: function (filename) {
        return OC.generateUrl('core') + '/preview.png?file=' + encodeURI(filename) + '&x=32&y=32';
    },

    /* Preview size 375x211 is used in files details view */
    generatePreviewUrl: function (filename) {
        return OC.generateUrl('core') + '/preview.png?file=' + encodeURI(filename) + '&x=375&y=211&a=1';
    },

    getImageIconUrl: function() {
        return OC.generateUrl('/apps/theming/img/core/filetypes') + '/image.svg?v=2';
    }

};
