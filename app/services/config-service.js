(function () {

    angular.module('katGui.services')
        .service('ConfigService', ConfigService);

    function ConfigService($mdDialog, $q, $http, StatusService, $rootScope, $log, $timeout, KatGuiUtil) {

        function urlBase() {
            return $rootScope.portalUrl? $rootScope.portalUrl + '/katconf' : '';
        }

        var api = {};
        api.receptorHealthTree = {};
        api.receptorList = [];
        api.KATObsPortalURL = null;
        api.systemConfig = null;
        api.productConfig = null;
        api.aggregateSensorDetail = null;
        api.resourceGroups = ['Components', 'Proxies'];
        api.sensorGroups = {};
        api.configPens = {};

        api.loadSensorGroups = function () {
            var deferred = $q.defer();
            $http(createRequest('get', urlBase() + '/sensor-groups'))
                .then(function (result) {
                    api.sensorGroups = result.data;
                    deferred.resolve(api.sensorGroups);
                }, function (message) {
                    $log.error(message);
                    deferred.reject();
                });
            return deferred.promise;
        };

        api.loadAggregateSensorDetail = function () {
            var deferred = $q.defer();
            if (!api.aggregateSensorDetail) {
                $http(createRequest('get', urlBase() + '/aggregates'))
                    .then(function (result) {
                        api.aggregateSensorDetail = result.data;
                        deferred.resolve(api.aggregateSensorDetail);
                    }, function (message) {
                        $log.error(message);
                        deferred.reject(message);
                    });
            } else {
                $timeout(function () {
                    deferred.resolve(api.aggregateSensorDetail);
                }, 1);
            }

            return deferred.promise;
        };

        api.getSystemConfig = function (forceConfig) {
            var deferred = $q.defer();
            if (api.systemConfig && !forceConfig) {
                $timeout(function () {
                    deferred.resolve(api.systemConfig);
                }, 1);
            } else if (urlBase() && KatGuiUtil.isValidURL(urlBase())) {
                $http(createRequest('get', urlBase() + '/system-config'))
                    .then(function (result) {
                        api.systemConfig = result.data;
                        deferred.resolve(api.systemConfig);
                        if (api.systemConfig && api.systemConfig.system && api.systemConfig.system.subarray_nrs) {
                            api.systemConfig.subarrayNrs = api.systemConfig.system.subarray_nrs.split(',');
                        }
                    }, function (message) {
                        $log.error(message);
                        deferred.reject(message);
                    });
            } else {
                $timeout(function () {
                    deferred.reject("No valid portalUrl has been specified.");
                }, 1);
            }
            return deferred.promise;
        };

        api.getConfigHealthViews = function () {
            return $http(createRequest('get', urlBase() + '/statustrees/custom_views'));
        };

        api.getProductConfig = function () {
            var deferred = $q.defer();
            if (api.productConfig) {
                $timeout(function () {
                    deferred.resolve(api.productConfig);
                });
            } else {
                $http(createRequest('get', urlBase() + '/array-config/product_conf'))
                    .then(function (result) {
                        api.productConfig = result.data;
                        deferred.resolve(api.productConfig);
                    }, function (message) {
                        $log.error(message);
                        deferred.reject(message);
                    });
            }
            return deferred.promise;
        };

        api.GetKATTaskFileServerURL = function () {
            if (api.systemConfig) {
                return 'http://' + api.systemConfig.katportal.kattaskfileserver;
            } else {
                return '';
            }
        };

        api.GetKATLogFileServerURL = function () {
            if (api.systemConfig) {
                return 'http://' + api.systemConfig.katportal.katlogfileserver;
            } else {
                return '';
            }
        };

        api.GetCentralLoggerURL = function () {
            if (api.systemConfig) {
                return 'http://' + api.systemConfig.katportal.katlogger;
            } else {
                return '';
            }
        };

        api.getStatusTreeForReceptor = function () {
            return $http(createRequest('get', urlBase() + '/statustrees/receptors_view/receptors'));
        };

        api.getStatusTreesForTop = function () {
            return $http(createRequest('get', urlBase() + '/statustrees/top_view'));
        };

        api.getReceptorList = function () {
            api.receptorList.splice(0, api.receptorList.length);

            var deferred = $q.defer();
            $http(createRequest('get', urlBase() + '/installed-config/receptors'))
                .then(function (result) {
                    result.data.forEach(function (item) {
                        api.receptorList.push(item);
                    });
                    deferred.resolve(api.receptorList);
                }, function (result) {
                    $log.error(result);
                    deferred.reject();
                });

            return deferred.promise;
        };

        api.getSiteLocation = function () {
            return $http(createRequest('get', urlBase() + '/array/position'));
        };

        api.getSources = function () {
            return $http(createRequest('get', urlBase() + '/sources'));
        };

        api.getWindstowLimits = function () {
            return $http(createRequest('get', urlBase() + '/array/windstow'));
        };

        api.getHorizonMask = function (receptorId) {
            return $http(createRequest('get', urlBase() + '/horizon-mask/' + receptorId));
        };

        api.getConfigFileContents = function (filePath) {
            return $http(createRequest('get', urlBase() + '/config-file/' + filePath));
        };

        api.getSourceCataloguesList = function () {
            return $http(createRequest('get', urlBase() + '/config-file/katconfig/user/catalogues'));
        };

        api.getNoiseDiodeModelsList = function () {
            return $http(createRequest('get', urlBase() + '/config-file/katconfig/user/noise-diode-models'));
        };

        api.getDelayModelsList = function () {
            return $http(createRequest('get', urlBase() + '/config-file/katconfig/user/delay-models'));
        };

        api.getPointingModelsList = function () {
            return $http(createRequest('get', urlBase() + '/config-file/katconfig/user/pointing-models'));
        };

        api.getCam2SpeadList = function () {
            return $http(createRequest('get', urlBase() + '/config-file/katconfig/user/cam2spead'));
        };

        api.getCorrelatorsList = function () {
            return $http(createRequest('get', urlBase() + '/config-file/katconfig/user/correlators'));
        };

        api.getApodForDate = function (date) {
            var formatedDate = moment(date).format('YYYY/MM/DD');
            return $http(createRequest('get', urlBase() + '/apod/' + formatedDate));
        };

        api.getConfigHealthPens = function () {
            var deferred = $q.defer();
            $http(createRequest('get', urlBase() + '/config-health-pens'))
                .then(function (result) {
                    api.configPens = result.data;
                    // TODO populate config-health-pens sensors by traversing the svg tree
                    deferred.resolve(api.configPens);
                }, function (result) {
                    $log.error(result);
                    deferred.reject();
                });
            return deferred.promise;
        };

        api.checkOutOfDateVersion = function () {
            if (document.katguiBuildDate) {
                $http(createRequest('get', urlBase() + '/katgui-version')).then(function (result) {
                    var cachedBuildDate = new Date(document.katguiBuildDate);
                    var latestBuildDate = new Date(parseInt(result.data.buildDate));
                    if (cachedBuildDate < latestBuildDate) {
                        var textContent = '<b>You have loaded an older version of KATGUI than what is currently available!</b></br>' +
                                     '</br>Your version was built on ' + cachedBuildDate + ', but the latest version was built on ' + latestBuildDate +
                                     '</br></br>Click "Reload" to get the latest version.</p>';
                        var confirmButton = 'Reload';
                        var cancelButton = 'Cancel';
                        $mdDialog
                            .show({
                                controller: function ($rootScope, $scope, $mdDialog, $sce) {
                                    $scope.title = 'KATGUI is out of date!';
                                    $scope.content = $sce.trustAsHtml(textContent);
                                    $scope.resolve = function () {
                                        window.location.reload(true);
                                    };
                                    $scope.reject = function () {
                                        $mdDialog.hide();
                                        $log.warn('User cancelled hard reload of KATGUI.');
                                    };
                                },
                                template: "<md-dialog style='padding: 0;' md-theme='red' aria-label=''>" +
                                "<div style='padding:0; margin:0; overflow: auto' layout='column' layout-padding >" +
                                "<md-toolbar class='md-primary' layout='row' layout-align='center center'><span style='margin:8px'>{{title}}</span></md-toolbar>" +
                                "<div flex><p ng-bind-html='content'></p></div>" +
                                "</div>" +
                                "<div layout='row' layout-align='end' style='margin-top: 8px; margin-right: 8px; margin-bottom: 8px; min-height: 40px;'>" +
                                "<md-button style='margin-left: 8px;' class='md-primary md-raised' md-theme='{{$root.themePrimaryButtons}}' aria-label='' ng-click='reject()'>" + cancelButton + "</md-button>" +
                                "<md-button style='margin-left: 8px;' class='md-primary md-raised' md-theme='red' aria-label='' ng-click='resolve()'>" + confirmButton + "</md-button>" +
                                "</div>" +
                                "</md-dialog>",
                                targetEvent: event
                            });
                    } else {
                        $log.info('This is the latest KATGUI build, built on: ' + latestBuildDate);
                    }
                });
            } else {
                $log.warn('There\'s no cached katgui build date! This could be because katgui is being served uncompiled.');
            }
        };

        function createRequest(method, url) {
            return {
                method: method,
                url: url,
                headers: {
                    'Authorization': 'CustomJWT ' + $rootScope.jwt
                }
            };
        }

        return api;
    }

})();
