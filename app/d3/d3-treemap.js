angular.module('katGui.d3')

    .directive('d3Treemap', function ($window, d3Service) {
        return{
            restrict: 'EA',
            scope: {
                data: '=',
                chartSize: '='
            },
            replace: false,
            link: function (scope, element) {

                d3Service.d3().then(function (d3) {

                    var width, height, inited = false;

                    var margin = {top: 20, right: 0, bottom: 0, left: 0},
                        formatNumber = d3.format(",d"),
                        transitioning;

                    scope.$watch('chartSize', function () {
                        if (scope.chartSize.width !== width || scope.chartSize.height !== height + margin.top) {
                            d3.select("#treemapHealthChart").remove();
                            chart(scope.data);
                        }
                    }, true);

                    chart(scope.data);

                    function chart(root) {

                        if (!inited) {
                            inited = true;
                            //we should only accumulate the data once, not on every redraw
                            accumulate(root);
                        }

                        width = scope.chartSize.width;
                        height = scope.chartSize.height - margin.top - margin.bottom;

                        var x = d3.scale.linear()
                            .domain([0, width])
                            .range([0, width]);

                        var y = d3.scale.linear()
                            .domain([0, height])
                            .range([0, height]);

                        var treemap = d3.layout.treemap()
                            .children(function (d, depth) {
                                return depth ? null : d._children;
                            })
                            .sort(function (a, b) {
                                //this sorts the data by name ascending, so ANT1 < ANT2 < ANT3 etc
                                return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
                            })
                            .ratio(height / width * 0.5 * (1 + Math.sqrt(5)))
                            .round(false);

                        scope.svg = d3.select(element[0]).append("svg")
                            .attr("id", "treemapHealthChart")
                            .attr("width", width + margin.left + margin.right)
                            .attr("height", height + margin.bottom + margin.top)
                            .attr("class", "health-chart")
                            .style("margin-left", -margin.left + "px")
                            .style("margin.right", -margin.right + "px")
                            .append("g")
                            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
                            .style("shape-rendering", "crispEdges");

                        var grandparent = scope.svg.append("g")
                            .attr("class", "grandparent");

                        grandparent.append("rect")
                            .attr("y", -margin.top)
                            .attr("width", width)
                            .attr("height", margin.top);

                        grandparent.append("text")
                            .attr("x", 6)
                            .attr("y", 6 - margin.top)
                            .attr("dy", ".75em");

                        initialize(root);
                        layout(root);
                        display(root);

                        function initialize(root) {
                            root.x = root.y = 0;
                            root.dx = width;
                            root.dy = height;
                            root.depth = 0;
                        }

                        // Aggregate the values for internal nodes. This is normally done by the
                        // treemap layout, but not here because of our custom implementation.
                        // We also take a snapshot of the original children (_children) to avoid
                        // the children being overwritten when when layout is computed.
                        function accumulate(d) {
                            return (d._children = d.children) ? d.value = d.children.reduce(function (p, v) {
                                return p + accumulate(v);
                            }, 0) : d.value;
                        }


                        // Compute the treemap layout recursively such that each group of siblings
                        // uses the same size (1×1) rather than the dimensions of the parent cell.
                        // This optimizes the layout for the current zoom state. Note that a wrapper
                        // object is created for the parent node for each group of siblings so that
                        // the parent’s dimensions are not discarded as we recurse. Since each group
                        // of sibling was laid out in 1×1, we must rescale to fit using absolute
                        // coordinates. This lets us use a viewport to zoom.
                        function layout(d) {
                            if (d._children) {
                                treemap.nodes({_children: d._children});
                                d._children.forEach(function (c) {
                                    c.x = d.x + c.x * d.dx;
                                    c.y = d.y + c.y * d.dy;
                                    c.dx *= d.dx;
                                    c.dy *= d.dy;
                                    c.parent = d;
                                    layout(c);
                                });
                            }
                        }

                        function display(d) {
                            grandparent
                                .datum(d.parent)
                                .on("click", transition)
                                .select("text")
                                .text(name(d));

                            var g1 = scope.svg.insert("g", ".grandparent")
                                .datum(d)
                                .attr("class", "depth");

                            var g = g1.selectAll("g")
                                .data(d._children)
                                .enter().append("g");

                            g.filter(function (d) {
                                return d._children;
                            })
                                .classed("children", true)
                                .on("click", transition);

                            g.filter(function (d) {
                                return !d._children;
                            })
                                .classed("no-children", true);

                            g.selectAll(".child")
                                .data(function (d) {
                                    return d._children || [d];
                                })
                                .enter().append("rect")
                                .attr("class", "child")
                                .call(rect);

                            g.append("rect")
                                .attr("class", "parent")
                                .call(rect)
                                .append("title")
                                .text(function (d) {
                                    return formatNumber(d.value);
                                });

                            g.append("text")
                                .attr("dy", ".75em")
                                .text(function (d) {
                                    return d.name;
                                })
                                .call(text);

                            function transition(d) {
                                if (transitioning || !d) {
                                    return;
                                }
                                transitioning = true;

                                var g2 = display(d),
                                    t1 = g1.transition().duration(750),
                                    t2 = g2.transition().duration(750);

                                // Update the domain only after entering new elements.
                                x.domain([d.x, d.x + d.dx]);
                                y.domain([d.y, d.y + d.dy]);

                                // Enable anti-aliasing during the transition.
                                scope.svg.style("shape-rendering", null);

                                // Draw child nodes on top of parent nodes.
                                scope.svg.selectAll(".depth").sort(function (a, b) {
                                    //this sorts the data by name ascending, so ANT1 < ANT2 < ANT3 etc
                                    return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
                                });

                                // Fade-in entering text.
                                g2.selectAll("text").style("fill-opacity", 0);

                                // Transition to the new view.
                                t1.selectAll("text").call(text).style("fill-opacity", 0);
                                t2.selectAll("text").call(text).style("fill-opacity", 1);
                                t1.selectAll("rect").call(rect);
                                t2.selectAll("rect").call(rect);

                                // Remove the old node when the transition is finished.
                                t1.remove().each("end", function () {
                                    scope.svg.style("shape-rendering", "crispEdges");
                                    transitioning = false;
                                });
                            }

                            return g;
                        }

                        function text(t) {
                            t.attr("x", function (d) {
                                return x(d.x) + 6;
                            })
                                .attr("y", function (d) {
                                    return y(d.y) + 6;
                                });
                        }

                        function rect(r) {
                            r.attr("x", function (d) {
                                return x(d.x);
                            })
                                .attr("y", function (d) {
                                    return y(d.y);
                                })
                                .attr("width", function (d) {
                                    return x(d.x + d.dx) - x(d.x);
                                })
                                .attr("height", function (d) {
                                    return y(d.y + d.dy) - y(d.y);
                                });
                        }

                        function name(d) {
                            return d.parent ? name(d.parent) + "." + d.name
                                : d.name;
                        }
                    }

                });
            }
        };
    });