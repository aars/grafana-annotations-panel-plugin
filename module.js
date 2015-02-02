define([
  'angular',
  'app',
  'lodash',
  'moment',
  'components/panelmeta',
],
function (angular, app, _, moment, PanelMeta) {
  'use strict';

  var module = angular.module('grafana.panels.annotations', []);
  app.useModule(module);


  module.controller('AnnotationsPanelCtrl', function($scope, panelSrv, annotationsSrv, timeSrv, datasourceSrv, $q) {
    $scope.panelMeta = new PanelMeta({
      description : "Annotations listing panel."
    });
    
    var promiseCached;
    var list = [];
    var timezone;
    $scope.annotations = {};
    $scope.range = timeSrv.timeRange();
    $scope.rangeUnparsed = timeSrv.timeRange(false);
    
    // set and populate defaults
    var _d = {
    };
    _.defaults($scope.panel, _d);

    // Main method that gets called every time we need to draw/refresh.
    $scope.get_data = function () {
      $scope.panelMeta.loading = true;

      $scope.updateTimeRange();

      $scope.annotationsPromise = getAnnotations($scope.rangeUnparsed, $scope.dashboard);
      
      $scope.annotationsPromise
        .then(function (annotations) {
          $scope.panelMeta.loading = false;
          $scope.annotations = annotations;
          $scope.render(annotations);
        }, function () {
          $scope.panelMeta.loading = false;
          $scope.render();
        });
    };
    $scope.$on('refresh', $scope.get_data); // Reload on refresh

    $scope.updateTimeRange = function () {
      $scope.range = timeSrv.timeRange();
      $scope.rangeUnparsed = timeSrv.timeRange(false);
    };

    // Copy of annotationsSrv.getAnnotations without the HTML formatting.
    function getAnnotations(rangeUnparsed, dashboard) {
      if (!dashboard.annotations.enable) {
        return $q.when(null);
      }

      if (promiseCached) {
        return promiseCached;
      }
      
      timezone = dashboard.timezone;
      var annotations = _.where(dashboard.annotations.list, {enable: true});
      var promises = _.map(annotations, function (annotation) {
        var datasource = datasourceSrv.get(annotation.datasource);
        
        return datasource.annotationQuery(annotation, rangeUnparsed)
          .then(receiveAnnotationResults)
          .then(null, errorHandler);
      }, this);

      promiseCached = $q.all(promises)
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
      var hrTimeFormat = 'YYYY-MM-DD HH:mm:ss';
      var hrTimeFormatShort = 'MM-DD HH:mm';
      
      var formatter = (timezone === 'browser') ? moment : moment.utc;
      annotation.hrTime = formatter(annotation.time).format(hrTimeFormat);
      annotation.hrTimeShort = formatter(annotation.time).format(hrTimeFormatShort);
     
      // Try to parse a 'type' from the title.
      ['info', 'warn', 'error', 'fatal'].forEach(function (type) {
        if (annotation.title.match(type)) {
          annotation.type = type;
          return;
        }
      });

      list.push(annotation);
    }

    function errorHandler(err) {
      console.log('Annotation error: ', err);
      var message = err.message || "Annotation query failed";
    }

    $scope.render = function (annotations) {
      $scope.$broadcast('render', annotations);
    }

    panelSrv.init($scope);
  });
});
