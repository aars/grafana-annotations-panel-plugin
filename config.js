// == Annotations Panel Configuration
define(function () {
  'use strict';

  return {
    // Human readable time formatting
    hrTimeFormat: 'YYYY-MM-DD HH:mm:ss',
    hrTimeFormatShort: 'MM-DD HH:mm',

    // Amount of character after which we call something long.
    isLongThreshold: 50,

    graphite: {
      eventsUrlBase: 'http://graphite.rxs.sp2o.org/events/',
      events: {
        // Define our default type and list all possible types.
        types: ['event', 'info', 'warn', 'error', 'fatal'],

        // Default type when no match is found.
        defaultType: 'event',

        // Define an annotation type by matching the title of an event.
        typeFromTitle: ['info', 'warn', 'error', 'fatal'],
      }
    }
  }
});
