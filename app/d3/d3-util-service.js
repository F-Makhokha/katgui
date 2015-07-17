angular.module('katGui.d3')

    .factory('d3Util', function ($q, $timeout, $rootScope, $log, StatusService, ConfigService, DATETIME_FORMAT) {

        var api = {};

        // Compute the treemap layout recursively such that each group of siblings
        // uses the same size (1×1) rather than the dimensions of the parent cell.
        // This optimizes the layout for the current zoom state. Note that a wrapper
        // object is created for the parent node for each group of siblings so that
        // the parent’s dimensions are not discarded as we recurse. Since each group
        // of sibling was laid out in 1×1, we must rescale to fit using absolute
        // coordinates. This lets us use a viewport to zoom.
        api.layout = function (d, mapLayout) {
            if (d._children) {
                mapLayout.nodes({_children: d._children});
                d._children.forEach(function (c) {
                    c.x = d.x + c.x * d.dx;
                    c.y = d.y + c.y * d.dy;
                    c.dx *= d.dx;
                    c.dy *= d.dy;
                    c.parent = d;
                    api.layout(c);
                });
            }
        };

        //the status class in the sensor objects that we get are numbers but we need
        //these string values so that we can apply proper class names to the html sensor elements
        api.statusClassFromNumber = function (num) {
            switch (num) {
                case 0:
                    return 'unknown';
                case 1:
                    return 'nominal';
                case 2:
                    return 'warn';
                case 3:
                    return 'error';
                case 4:
                    return 'failure';
                case 5:
                    return 'unreachable';
                case 6:
                    return 'inactive';
                default:
                    return 'inactive';
            }
        };

        //trim unnecessary characters from sensor names and bind to the new attribute in the directive classes
        api.trimmedReceptorName = function (d, argName) {
            if (d.depth > 0) {
                d.sensorValue.trimmedName = d.sensorValue.trimmedName.replace(argName + '_', '');
                return d.sensorValue.trimmedName;
            } else {
                return d.name;
            }
        };

        //convenience function to create the id's for the html elements that needs to be styled
        api.createSensorId = function (d, rootName) {
            if (d.depth > 0) {
                return rootName + "_" + d.sensor;
            } else {
                return d.name + "_" + d.sensor;
            }
        };

        //convenience function to populate every item's tooltip
        api.applyTooltipValues = function (node, tooltip, rootName) {
            //d.on is not defined while transitioning
            if (node.on) {
                node.on("mouseover", function (d) {
                    api.updateTooltipValues(d, tooltip, rootName);
                    tooltip.style("visibility", "visible");
                }).on("mousemove", function (d) {
                    api.updateTooltipValues(d, tooltip, rootName);
                    var uiViewDiv = document.querySelector('#ui-view-container-div');
                    var offset = d3.mouse(uiViewDiv);
                    var x = offset[0];
                    var y = offset[1];

                    if (window.innerWidth - x < 320) {
                        x = window.innerWidth - 320;
                    }
                    if (window.innerHeight - y < 225) {
                        y = window.innerHeight - 225;
                    }
                    tooltip
                        .style("top", (y + 15 + angular.element(uiViewDiv).scrollTop()) + "px")
                        .style("left", (x + 5 + angular.element(uiViewDiv).scrollLeft()) + "px");

                }).on("mouseout", function () {
                    tooltip.style("visibility", "hidden");
                });
            }
        };

        api.updateTooltipValues = function (d, tooltip, rootName) {
            var fontSizeAfterZoom = 14 * (1/window.devicePixelRatio);
            var sensorValue;
            if (StatusService.sensorValues && StatusService.sensorValues[(rootName? rootName + '_' : '') + d.sensor]) {
                sensorValue = StatusService.sensorValues[(rootName? rootName + '_' : '') + d.sensor];
            } else  {
                sensorValue = d.sensorValue;
            }
            if (sensorValue) {
                //to display readable tooltips, no matter the zoom level
                tooltip.html(
                    "<div style='font-size: +"+ fontSizeAfterZoom +"px'>" +
                    "<div><b>" + sensorValue.name + "</b></div>" +
                    "<div><span style='width: 100px; display: inline-block; font-style: italic'>value:</span>" + sensorValue.value + "</div>" +
                    "<div><span style='width: 100px; display: inline-block; font-style: italic'>status:</span>" + sensorValue.status + "</div>" +
                    "<div><span style='width: 100px; display: inline-block; font-style: italic'>timestamp:</span>" + moment.utc(sensorValue.timestamp, 'X').format(DATETIME_FORMAT) + "</div>" +
                    "</div>"
                );
            } else {
                tooltip.html(
                    "<div style='font-size: +"+ fontSizeAfterZoom +"px'>Error Reading Sensor Value</div>"
                );
            }
        };

        api.updateGraphTooltipValues = function (d, tooltip) {
            tooltip.html(
                "<div class='chart-tooltip'>" +
                "<b>" + d.TooltipValue + "</b>" +
                "<br/>"+ moment.utc(d.Timestamp, 'X').format(DATETIME_FORMAT) +
                "</div>"
            );
        };

        //convenience function to create the tooltip div on the given element
        api.createTooltip = function (element) {
            return d3.select(element).append('div')
                .attr('class', 'treemap-tooltip')
                .style('visibility', 'hidden')
                .style('background-color', '#ffffff');
        };

        //because we subscribe to monitor for our data and have to wait for our data to trickle in
        //we cant just immediately bind to our data, this convenience function waits until we have
        //data that we can bind to and returns a promise that the client can wait on
        //only applicable to the receptor status tree map, other directive's bindings works properly
        api.waitUntilDataExists = function (data) {
            var deferred = $q.defer();
            var retries = 0, maxRetries = 50;

            //start checking later so that the promise is always returned before it can be resolved
            $timeout(function () {
                checkIfDataExists();
            }, 1);

            function checkIfDataExists() {
                if (data.children.length === 0 && retries < maxRetries) {
                    $timeout(function () {
                        checkIfDataExists();
                    }, 500);
                    retries++;
                } else if (retries >= maxRetries) {
                    deferred.reject();
                } else {
                    deferred.resolve();
                }
            }

            return deferred.promise;
        };

        api.displayInitErrorMessage = function (dataMapName) {
            $rootScope.showSimpleDialog('Error displaying data', 'Could not display the Receptor Status data, contact the katGUI support team.');
            $log.error('Error binding to StatusService data for receptor ' + dataMapName);
        };

        api.showDialogForAggregateSensorInfo = function (sensorName) {
            if (ConfigService.aggregateSensorDetail[sensorName]) {
                $rootScope.showPreDialog('Aggregate Sensor ' + sensorName + ' Details', JSON.stringify(ConfigService.aggregateSensorDetail[sensorName], null, 4));
            } else {
                $log.error('No such aggregate sensor in ConfigService ' + sensorName);
            }
        };

        return api;
    });
