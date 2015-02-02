define([
  'angular',
  'app',
  'lodash',
  'components/panelmeta',
],
function (angular, app, _, PanelMeta) {
  'use strict';

  var module = angular.module('grafana.panels.annotations', []);
  app.useModule(module);
  module.controller('AnnotationsPanelCtrl', function($scope, panelSrv, annotationsSrv, timeSrv) {
    $scope.panelMeta = new PanelMeta({
      description : "A static text panel that can use plain text, markdown, or (sanitized) HTML"
    });
    
    $scope.range = timeSrv.timeRange();
    $scope.rangeUnparsed = timeSrv.timeRange(false);
    console.log($scope.rangeUnparsed, $scope.dashboard);

    $scope.annotationsPromise = annotationsSrv.getAnnotations($scope.rangeUnparsed, $scope.dashboard);
    
    $scope.annotationsPromise
      .then(function (annotations) {
        $scope.annotations = annotations;
        $scope.render();
      }, function () {
        console.log('error');
        $scope.render();
      });

    // set and populate defaults
    var _d = {
    };
    
    $scope.render = function (annotations) {
      $scope.$broadcast('render', annotations);
    }

    _.defaults($scope.panel, _d);

    panelSrv.init($scope);
  });
});
