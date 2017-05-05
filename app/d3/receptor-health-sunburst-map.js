angular.module('katGui.d3')

    .directive('receptorHealthSunburstMap', function ($rootScope, StatusService, d3Util, $localStorage) {
        return {
            restrict: 'E',
            scope: {
                dataMapName: '=receptor',
                sizeStorageKey: '@'
            },
            link: function (scope, element) {

                var node, root, transitionDuration = 250;
                var tooltip = d3.select(angular.element(document.querySelector('.treemap-tooltip'))[0]), containerSvg;
                //create our maplayout for the data and sort it alphabetically
                //the bockvalue is the relative size of each child element, it is
                //set to a static 100 when we get our monitor data in the StatusService
                var mapLayout = d3.layout.partition()
                    .value(function (d, i) {
                        if (i === 0) {
                            return 0.5;
                        }
                        return 1;
                    })
                    .sort(function (a, b) {
                        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
                    });
                scope.sizeStorageKey = scope.sizeStorageKey? scope.sizeStorageKey : 'receptorHealthDisplaySize';

                if ($localStorage[scope.sizeStorageKey]) {
                    scope.chartSize = JSON.parse($localStorage[scope.sizeStorageKey]);
                } else {
                    scope.chartSize = {width: 480, height: 480};
                }

                var unbindRedraw = $rootScope.$on('redrawChartMessage', function (event, message) {
                    if (message.size.width) {
                        scope.chartSize.width = message.size.width;
                    }
                    if (message.size.height) {
                        scope.chartSize.height = message.size.height;
                    }
                    containerSvg.remove();
                    scope.redraw();
                });

                scope.$on('$destroy', function () {
                    unbindRedraw();
                });

                scope.data = function () {
                    if (scope.dataMapName instanceof Object) {
                        return scope.dataMapName;
                    } else {
                        return StatusService.statusData[scope.dataMapName];
                    }
                };

                scope.dataName = function () {
                    if (scope.dataMapName instanceof Object) {
                        return scope.dataMapName.name;
                    } else {
                        return scope.dataMapName;
                    }
                };

                scope.redraw = function () {
                    if (!scope.data()) {
                        return;
                    }

                    var width = scope.chartSize.width;
                    var height = scope.chartSize.height;
                    var radius = height / 2;
                    var padding = 2;
                    node = root = scope.data();

                    //create our x,y axis linear scales
                    var x = d3.scale.linear().range([0, 2 * Math.PI]);
                    var y = d3.scale.linear().range([0, radius]);

                    //create the main svg element
                    containerSvg = d3.select(element[0]).append("svg")
                        .attr("class", "health-chart treemapHealthChart" + scope.dataName())
                        .attr("width", width + padding * 2)
                        .attr("height", height + padding * 2);

                    var svg = containerSvg.append("g")
                        .attr("transform", "translate(" + [radius + padding, radius + padding] + ")");

                    //define the math for calculating the child node's arcs
                    var arc = d3.svg.arc()
                        .startAngle(function (d) {
                            return Math.max(0, Math.min(2 * Math.PI, x(d.x)));
                        })
                        .endAngle(function (d) {
                            return Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx)));
                        })
                        .innerRadius(function (d) {
                            return Math.max(0, y(d.y));
                        })
                        .outerRadius(function (d) {
                            return Math.max(0, y(d.y + d.dy));
                        });

                    //create each child node svg:g element
                    var g = svg.selectAll("g")
                        .data(mapLayout.nodes(scope.data()))
                        .enter().append("g");

                    //add the arc math as a svg:path element
                    var path = g.append("path")
                        .attr("d", arc)
                        .attr("class", function (d) {
                            var prefix = d.prefix? d.prefix : '';
                            var classStr = '';
                            var dataName = '';
                            if (scope.dataMapName instanceof Object) {
                                classStr = d.sensor + ' health-full-item ';
                                dataName = d.sensor;
                            } else {
                                classStr = d3Util.createSensorId(d, scope.dataName()) + ' health-full-item ';
                                dataName = prefix + scope.dataName() + '_' + d.sensor;
                            }
                            classStr += (StatusService.sensorValues[dataName] ?
                                    StatusService.sensorValues[dataName].status : 'inactive') + '-child child';
                            return classStr;
                        })
                        .call(function (d) {
                            d3Util.applyTooltipValues(d, tooltip);
                        })
                        .on("click", click);

                    //add the text overlay for each element
                    var text = g.append("text")
                        .attr("transform", function (d) {
                            if (d.depth > 0) {
                                return "rotate(" + computeTextRotation(d) + ")";
                            } else {
                                return "translate(-25,0)";
                            }
                        })
                        .attr("x", function (d) {
                            return y(d.y);
                        })
                        .attr("dx", "4") // margin
                        .attr("dy", ".35em") // vertical-align
                        .attr("class", function (d) {
                            var prefix = d.prefix? d.prefix : '';
                            var dataName = '';
                            if (scope.dataMapName instanceof Object) {
                                dataName = d.sensor;
                            } else {
                                dataName = prefix + scope.dataName() + '_' + d.sensor;
                            }
                            var classString = StatusService.sensorValues[dataName] ?
                                StatusService.sensorValues[dataName].status : 'inactive';
                            if (d.depth === 0) {
                                return classString + '-child-text parent ' + dataName;
                            } else {
                                return classString + '-child-text child ' + dataName;
                            }
                        })
                        .text(function (d) {
                            if (d.depth > 0) {
                                var name = d.name;
                                var parentNode = d.parent;
                                for (var i = d.depth; i > 0; i--) {
                                    name = name.replace(parentNode.name + '_', '');
                                    parentNode = parentNode.parent;
                                }
                                return name;
                            } else {
                                return d.name;
                            }
                        });

                    //zoom functionality when clicking on an item
                    function click(d) {
                        // fade out all text elements
                        text.transition().attr("opacity", 0);

                        path.transition()
                            .duration(transitionDuration)
                            .attrTween("d", arcTween(d))
                            .each("end", function (e) {
                                // check if the animated element's data e lies within the visible angle span given in d
                                if (e.x >= d.x && e.x < (d.x + d.dx)) {
                                    // get a selection of the associated text element
                                    var arcText = d3.select(this.parentNode).select("text.child");
                                    // fade in the text element and recalculate positions
                                    arcText.transition().duration(transitionDuration)
                                        .attr("opacity", 1)
                                        .attr("transform", function () {
                                            return "rotate(" + computeTextRotation(e) + ")";
                                        })
                                        .attr("x", function (d) {
                                            return y(d.y);
                                        });
                                    var parentArcText = d3.select(this.parentNode).select("text.parent");
                                    parentArcText.transition().duration(transitionDuration)
                                        .attr("opacity", 1)
                                        .attr("x", function (d) {
                                            return y(d.y);
                                        });
                                }
                            });
                    }

                    function arcTween(d) {
                        var xd = d3.interpolate(x.domain(), [d.x, d.x + d.dx]),
                            yd = d3.interpolate(y.domain(), [d.y, 1]),
                            yr = d3.interpolate(y.range(), [d.y ? 20 : 0, radius]);
                        return function (d, i) {
                            return i ? function (t) {
                                return arc(d);
                            }
                                : function (t) {
                                x.domain(xd(t));
                                y.domain(yd(t)).range(yr(t));
                                return arc(d);
                            };
                        };
                    }

                    function computeTextRotation(d) {
                        return (x(d.x + d.dx / 2) - Math.PI / 2) / Math.PI * 180;
                    }
                };

                scope.redraw();
            }
        };
    });
