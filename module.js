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
    $sce
    ) {

    $scope.panelMeta = new PanelMeta({
      description : "Annotations panel using graphite events."
    });
    $scope.panelMeta.addEditorTab('Filters', 'plugins/annotations.panel/filter-editor.html');

    // Cached annotations
    var promiseCached;
    var list = [];

    var timezone;
    $scope.annotations = {};
    $scope.range = timeSrv.timeRange();
    $scope.rangeUnparsed = timeSrv.timeRange(false);

    // Get includable types from config
    function includableTypes() {
      if (!config.graphite || !config.graphite.events) return [];
      var c = config.graphite.events;

      return c.types || [];
    }

    // set and populate defaults
    var _d = {
      includeTypes: ['info', 'error', 'fatal'],
      includableTypes: includableTypes(),
      datasource: 'graphite',
      graphiteTags: null
    };
    _.defaults($scope.panel, _d);

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
    $scope.$watch('panel.includeTypes', refresh);
    $scope.$watch('panel.datasource', refresh);
    $scope.$watch('panel.graphiteTags', refresh);

    // Refresh when dashboard wants to.
    $rootScope.onAppEvent('refresh', clearCache);
    $rootScope.onAppEvent('setup-dashboard', clearCache);

    // Main method that gets called every time we need to draw/refresh.
    $scope.get_data = function () {
      $scope.panelMeta.loading = true;

      $scope.updateTimeRange();

      $scope.annotationsPromise = getAnnotations($scope.rangeUnparsed);

      $scope.annotationsPromise
        .then(function (annotations) {
          $scope.panelMeta.loading = false;
          $scope.annotations = annotations;

          $scope.render();
        }, function () {
          $scope.panelMeta.loading = false;
          $scope.render();
        });
    };

    $scope.updateTimeRange = function () {
      $scope.range = timeSrv.timeRange();
      $scope.rangeUnparsed = timeSrv.timeRange(false);
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
          .then(null, errorHandler)
          .then(function () {
            return list;
          });

      return promiseCached;
    }

    function receiveAnnotationResults(results) {
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

      // Apply inclusion rules.
      if (!includeAnnotation(annotation)) return;

      // Human readable timestamps
      var hrTimeFormat = config.hrTimeFormat;
      var hrTimeFormatShort = config.hrTimeFormatShort;
      var formatter = (timezone === 'browser') ? moment : moment.utc;
      annotation.hrTime = formatter(annotation.time).format(hrTimeFormat);
      annotation.hrTimeShort = formatter(annotation.time).format(hrTimeFormatShort);

      // Add annotation in reverse order, newest first.
      list.unshift(annotation);
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

    // Helper to display events in modal
    $scope.annotationModal = function (annotation) {
      $scope.textAsHtml = function (text) {
        return $sce.trustAsHtml(text.replace("\r\n", "<br>"));
      }

      $scope.annotation = annotation;
    }

    $scope.render = function () {
      $scope.$broadcast('render');
    }

    panelSrv.init($scope);
  });
});
