define([
  'angular',
  'app',
  'lodash',
  'moment',
  'components/panelmeta',
  './config'
],
function (angular, app, _, moment, PanelMeta, config) {
  'use strict';

  var module = angular.module('grafana.panels.annotations', []);
  app.useModule(module);

  module.controller('AnnotationsPanelCtrl', function(
    $scope,
    $rootScope,
    panelSrv,
    annotationsSrv,
    timeSrv,
    datasourceSrv,
    $q,
    $sce,
    $modal
    ) {

    $scope.panelMeta = new PanelMeta({
      description : "Annotations panel using graphite events."
    });
    $scope.panelMeta.addEditorTab('Filters', 'plugins/annotations.panel/filter-editor.html');

    // Cached annotations promise and full list.
    var promiseCached;
    var list = [];

    // Annotations to render.
    $scope.annotations = [];

    var timezone;
    $scope.range = timeSrv.timeRange();
    $scope.rangeUnparsed = timeSrv.timeRange(false);

    // Get includable types from config
    function includableTypes() {
      if (!config.graphite || !config.graphite.events) return [];
      var c = config.graphite.events;

      return c.types || [];
    }

    function clearCache() {
      promiseCached = null;
      list = [];
    }
    function refresh() {
      clearCache();
      $scope.get_data();
    }

    // refresh when we want to.
    $scope.$on('refresh', refresh);

    $scope.$watch('panel.includeTypes', $scope.render);
    $scope.$watch('panel.graphiteTags', refresh);

    // We don't support other datasources yet
    // $scope.$watch('panel.datasource', refresh);

    // Clear cache when dashboard want to refresh.
    $rootScope.onAppEvent('refresh', clearCache);
    $rootScope.onAppEvent('setup-dashboard', clearCache);

    $scope.updateTimeRange = function () {
      $scope.range = timeSrv.timeRange();
      $scope.rangeUnparsed = timeSrv.timeRange(false);
    };

    // Main method that gets called every time we need to draw/refresh.
    $scope.get_data = function () {
      $scope.panelMeta.loading = true;

      $scope.updateTimeRange();

      $scope.annotationsPromise = getAnnotations($scope.rangeUnparsed);

      $scope.annotationsPromise
        .then(function (annotations) {
          $scope.panelMeta.loading = false;
          $scope.render();
        }, function () {
          $scope.panelMeta.loading = false;
          $scope.render();
        });
    };

    function getAnnotations(rangeUnparsed) {
      if (promiseCached) {
        return promiseCached;
      }

      timezone = $scope.dashboard.timezone;
      var datasource = datasourceSrv.get($scope.panel.datasource);
      var annotation = {tags: $scope.panel.graphiteTags};

      promiseCached = datasource.annotationQuery(annotation, rangeUnparsed)
          .then(receiveAnnotationResults)
          .then(null, errorHandler);

      promiseCached.then(function () {
        return list;
      });

      return promiseCached;
    }

    function receiveAnnotationResults(results) {
      // Clear and repopulate list.
      list = [];
      for (var i=0; i<results.length; i++) {
        addAnnotation(results[i]);
      }
    }

    // Analyze and enrich annotation with usefullness.
    function addAnnotation(annotation) {
      // Try to parse a 'type' from the title.
      annotation.type   = annotationType(annotation);

      // Is this a 'long' event?
      annotation.isLong = annotation.text.length > config.isLongThreshold;

      // Human readable timestamps
      var hrTimeFormat = config.hrTimeFormat;
      var hrTimeFormatShort = config.hrTimeFormatShort;
      var formatter = (timezone === 'browser') ? moment : moment.utc;
      annotation.hrTime = formatter(annotation.time).format(hrTimeFormat);
      annotation.hrTimeShort = formatter(annotation.time).format(hrTimeFormatShort);

      // Try to find message/data.
      parseAnnotationText(annotation);

      // parse tagstring.
      parseAnnotationTags(annotation);

      // Add annotation in reverse order, newest first.
      list.unshift(annotation);
    }

    // Seperate tags string into seperate tags
    function parseAnnotationTags(annotation) {
      // We support comma and space seperated.
      var seperator = (annotation.tags.indexOf(',') !== -1) ? ',' : ' ';
      annotation.tagList = annotation.tags.split(seperator);
    }

    // Try to parse {message: 'message', data: {}} format.
    function parseAnnotationText(annotation) {
      var message = annotation.text, data, dataString;
      try {
        var json = JSON.parse(annotation.text);

        message    = json.message;
        data       = json.data;
        dataString = data;

        // try to prettify the dataString if it looks like JSON
        if (typeof data === 'object') {
          dataString = JSON.stringify(data, null, '  ');
        }
      } catch (e) {}

      annotation.message    = message;
      annotation.data       = data;
      annotation.dataString = dataString;
    }

    // Is the annotation(.type) included in our list?
    function includeAnnotation(annotation) {
      // No types included? Everything is included!
      if (!$scope.panel.includeTypes || !$scope.panel.includeTypes.length) return true;

      return $scope.panel.includeTypes.indexOf(annotation.type) !== -1;
    }

    // Determine annotation 'type' using config.
    function annotationType(annotation) {
      // We need a config at least.
      if (!config.graphite.events || !config.graphite.events.defaultType) return;
      var c     = config.graphite.events,
          title = annotation.title,
          type  = c.defaultType;

      if (!c.typeFromTitle) return c.defaultType;

      c.typeFromTitle.forEach(function (typeMatch) {
        if (title.match(typeMatch)) return type = typeMatch;
      });

      return type;
    }

    function errorHandler(err) {
      console.log('Annotation error: ', err);
      var message = err.message || "Annotation query failed";
    }

    function filterAnnotations() {
      return list.filter(function (annotation) {
        return includeAnnotation(annotation);
      });
    }

    // set and populate defaults
    var _d = {
      includeTypes: [],
      includableTypes: includableTypes(),
      datasource: 'graphite',
      graphiteTags: null
    };
    _.defaults($scope.panel, _d);

    // Helper to display events in modal
    $scope.annotationModal = function (annotation) {
      var scope = $rootScope.$new();

      scope.tagColor = $scope.tagColor;
      scope.annotation = annotation;
      var modal = $modal({
        template: 'plugins/annotations.panel/annotation-modal.html',
        modalClass: 'testclass',
        //persist: true,
        show: false,
        scope: scope,
        keyboard: false
      });

      $q.when(modal).then(function (modalEl) {
        modalEl.modal('show');
      });
    }

    $scope.tagColor = function (tag) {
      var stringHexNumber = (
          parseInt(
            parseInt(tag, 36).toExponential().slice(2,-5)
          , 10) & 0xFFFFFF
        ).toString(16).toUpperCase();

      return '#' + ('000000' + stringHexNumber).slice(-6);
    }
    $scope.render = function () {
      $scope.annotations = filterAnnotations();
      $scope.$broadcast('render');
    }


    panelSrv.init($scope);
  });
});
