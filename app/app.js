(function () {
    "use strict";

    angular.module('katGui', ['ngMaterial', 'ngMessages',
        'ui.bootstrap',
        'ui.router',
        // 'ui.utils',
        'ngAnimate', 'katGui.services',
        'katGui.admin',
        'katGui.alarms',
        'katGui.config',
        'katGui.d3',
        'katGui.health',
        'katGui.widgets',
        'katGui.landing',
        'katGui.util',
        'katGui.scheduler',
        'katGui.services',
        'katGui.video'])
    .config(configureKatGui)
    .run(runKatGui)
    .controller('ApplicationCtrl', ApplicationCtrl);

    angular.module('katGui').constant('UI_VERSION', '0.0.1')
        .constant('USER_ROLES', {
            all: "all",
            user_admin: "user_admin",
            control_authority: "control_authority",
            lead_operator: "lead_operator",
            operator: "operator",
            read_only: "read_only",
            expert: "expert"
        })
        .constant('THEMES', [
            {
                name: 'Blue-Grey',
                primary: 'blue-grey',
                secondary: 'deep-purple',
                primaryButtons: 'indigo'
            },
            {
                name: 'Indigo',
                primary: 'indigo',
                secondary: 'blue',
                primaryButtons: 'blue'
            },
            {
                name: 'Teal',
                primary: 'teal',
                secondary: 'amber',
                primaryButtons: 'indigo'
            },
            {
                name: 'Dark',
                primary: 'dark',
                secondary: 'dark-secondary',
                primaryButtons: 'dark-buttons'
            }]);

    function ApplicationCtrl($rootScope, $scope, $state, $interval, $mdSidenav, $localStorage, $q, THEMES,
                             AlarmsService, ConfigService, USER_ROLES, MonitorService, KatGuiUtil, SessionService,
                             CENTRAL_LOGGER_PORT, $log, NotifyService, $timeout, StatusService, ObsSchedService) {
        var vm = this;

        var theme = _.find(THEMES, function (theme) {
            return $localStorage['selectedTheme'] === theme.name;
        });
        if (!theme) {
            theme = THEMES[0];
        }
        if (theme.name === 'Dark') {
            angular.element(document.querySelector('body')).addClass('dark-theme');
        } else {
            angular.element(document.querySelector('body')).removeClass('dark-theme');
        }
        $rootScope.themePrimary = theme.primary;
        $rootScope.themeSecondary = theme.secondary;
        $rootScope.themePrimaryButtons = theme.primaryButtons;
        $rootScope.expertOrLO = false;
        $rootScope.showVideoLinks = false;
        $rootScope.connectedToMonitor = true;

        $rootScope.devMode = window.location.host === 'localhost:8000';
        $rootScope.portalUrl = $rootScope.devMode? $localStorage.devModePortalURL : window.location.origin;
        if ($rootScope.portalUrl === 'http://') {
            $rootScope.portalUrl = '';
        }

        $rootScope.possibleRoles = ['lead_operator', 'expert', 'control_authority', 'operator', 'read_only'];
        $rootScope.rolesMap = {
            lead_operator: 'Lead Operator',
            expert: 'Expert User',
            control_authority: 'Control Authority',
            operator: 'Operator',
            read_only: 'Monitor Only'
        };

        $rootScope.configHealthViews = [];

        SessionService.recoverLogin();

        $rootScope.getSystemConfig = function (forceConfig) {
            var deferred = $q.defer();
            if ($rootScope.systemConfig && !forceConfig) {
                $timeout(function () {
                    deferred.resolve($rootScope.systemConfig);
                }, 1);
            } else {
                ObsSchedService.subarrays.splice(0, ObsSchedService.subarrays.length);
                ConfigService.getSystemConfig(forceConfig).then(function (systemConfig) {
                    $rootScope.systemConfig = systemConfig;
                    StatusService.controlledResources = systemConfig.katobs.controlled_resources.split(',');
                    if (systemConfig.vds && systemConfig.vds.vds_source) {
                        $rootScope.showVideoLinks = KatGuiUtil.isValidURL(systemConfig.vds.vds_source);
                    }
                    $rootScope.systemType = systemConfig.system.system_conf.replace('katcamconfig/systems/', '').replace('.conf', '');
                    $rootScope.confConnectionError = null;
                    deferred.resolve($rootScope.systemConfig);
                }, function (error) {
                    if ($rootScope.portalUrl) {
                        $rootScope.confConnectionError = 'Could not connect to ' + $rootScope.portalUrl + '/katconf. Is the URL correct?';
                    } else {
                        $rootScope.confConnectionError = 'Development mode: Please specify a host to connect to. E.g. monctl.devf.camlab.kat.ac.za';
                    }
                    //retry every 10 seconds to get the system config
                    if (vm.getSystemConfigTimeout) {
                        $timeout.cancel(vm.getSystemConfigTimeout);
                    }
                    vm.getSystemConfigTimeout = $timeout(function () {
                        $rootScope.getSystemConfig(forceConfig);
                    }, 10000);
                });
            }
            return deferred.promise;
        };

        vm.initApp = function () {
            vm.showNavbar = true;
            $rootScope.showDate = $localStorage['showDate'];
            $rootScope.showDayOfYear = $localStorage['showDayOfYear'];
            $rootScope.showJulianDate = $localStorage['showJulianDate'];
            $rootScope.showLST = $localStorage['showLST'];
            $rootScope.showLocalAndSAST = $localStorage['showLocalAndSAST'];
            $rootScope.showLargeAlarms = $localStorage['showLargeAlarms'];
            $rootScope.sensorListStrategyType = $localStorage['sensorListStrategyType'];
            $rootScope.sensorListStrategyInterval = $localStorage['sensorListStrategyInterval'];
            $rootScope.logNumberOfLines = $localStorage['logNumberOfLines'];
            $rootScope.disableAlarmSounds = $localStorage['disableAlarmSounds'];
            $rootScope.showAlarms = $localStorage['showAlarmsNotify'];

            if (!angular.isDefined($rootScope.showAlarms)) {
                $rootScope.showAlarms = true;
            }

            if (!$rootScope.sensorListStrategyType) {
                $rootScope.sensorListStrategyType = 'event-rate';
            }
            if (!$rootScope.logNumberOfLines) {
                $rootScope.logNumberOfLines = 200;
            }
            if (!$rootScope.sensorListStrategyInterval) {
                $rootScope.sensorListStrategyInterval = 3;
            }
            if (!angular.isDefined($rootScope.showLST)) {
                $rootScope.showLST = true;
            }
            if (!angular.isDefined($rootScope.showDate)) {
                $rootScope.showDate = true;
            }
            if (!angular.isDefined($rootScope.showDayOfYear)) {
                $rootScope.showDayOfYear = false;
            }
            if (!angular.isDefined($rootScope.showJulianDate)) {
                $rootScope.showJulianDate = true;
            }

            if (!angular.isDefined($rootScope.showLocalAndSAST)) {
                $rootScope.showLocalAndSAST = true;
            }

            vm.currentUser = null;
            vm.userRoles = USER_ROLES;
            $rootScope.alarmsData = AlarmsService.alarmsData;
            $rootScope.currentLeadOperator = MonitorService.currentLeadOperator;
            $rootScope.interlockState = MonitorService.interlockState;

            vm.utcTime = '';
            vm.localTime = '';

            if (vm.updateTimeDisplayInterval) {
                $interval.cancel(vm.updateTimeDisplayInterval);
            }
            vm.updateTimeDisplayInterval = $interval(vm.updateTimeDisplay, 500);
            ConfigService.getSiteLocation()
                .then(function (result) {
                    var trimmedResult = result.data.replace(/"/g, '');
                    $rootScope.longitude = KatGuiUtil.degreesToFloat(trimmedResult.split(',')[1]);
                    $rootScope.latitude = KatGuiUtil.degreesToFloat(trimmedResult.split(',')[0]);
                }, function (error) {
                    $log.error("Could not retrieve site location from config server, LST will not display correctly. ");
                    $log.error(error);
                });

            $rootScope.showSBDetails = NotifyService.showSBDetails;
            if (!ConfigService.systemConfig) {
                $rootScope.getSystemConfig();
            }

            ConfigService.getConfigHealthViews().then(
                function(result) {
                    $rootScope.configHealthViews = [];
                    _.each(result.data, function (value, key, obj) {
                        $rootScope.configHealthViews.push(key);
                    });
                },
                function(error) {
                    $log.error(error);
                });
        };

        vm.unbindLoginSuccess = $rootScope.$on('loginSuccess', function () {
            vm.showNavbar = true;
            vm.initApp();
        });

        $rootScope.connectEvents = function (reconnecting) {
            MonitorService.connectListener()
                .then(function () {
                    if ($rootScope.connectedToMonitor) {
                        if (reconnecting && $rootScope.currentStateName().startsWith('sched')) {
                            MonitorService.subscribe('sched');
                            ObsSchedService.getProgramBlocks();
                            ObsSchedService.getScheduleBlocks();
                            ObsSchedService.getProgramBlocksObservationSchedule();
                        }
                        if (reconnecting) {
                            $log.info('Reconnected Monitor Connection.');
                        }
                    } else {
                        $timeout($rootScope.connectEvents, 3000);
                    }
                }, function () {
                    $log.error('Could not establish Monitor connection. Retrying again in 3 seconds.');
                    $timeout($rootScope.connectEvents, 3000);
                });
            vm.handleMonitorSocketTimeout();
        };
        vm.toggleNavbar = function () {
            vm.showNavbar = !vm.showNavbar;
        };
        vm.handleMonitorSocketTimeout = function () {
            MonitorService.getTimeoutPromise()
                .then(function () {
                    if (!vm.disconnectIssued) {
                        $log.info('Monitor connection timeout! Attempting to reconnect...');
                        $timeout(function () {
                            $rootScope.connectEvents(true);
                        }, 3000);
                    }
                });
        };
        vm.toggleLeftSidenav = function () {
            $mdSidenav('left-sidenav').toggle();
        };
        vm.toggleRightSidenav = function () {
            $mdSidenav('right-sidenav').toggle();
        };
        vm.checkAllowedRole = function (role) {
            return role !== 'user_admin' && role !== $rootScope.currentUser.req_role;
        };
        $rootScope.logout = function () {
            vm.disconnectIssued = true;
            MonitorService.disconnectListener();
            $mdSidenav('right-sidenav').close();
            SessionService.logout();
            vm.showNavbar = false;
        };
        $rootScope.stateGo = function (newState, params) {
            $state.go(newState, params);
        };
        vm.sideNavStateGo = function (newState, params) {
            $rootScope.stateGo(newState, params);
            $mdSidenav('left-sidenav').close();
        };
        vm.sideNavRightStateGo = function (newState) {
            $rootScope.stateGo(newState);
            $mdSidenav('right-sidenav').close();
        };
        $rootScope.currentStateTitle = function () {
            return $state.current.title;
        };
        $rootScope.currentStateName = function () {
            return $state.current.name;
        };
        vm.navigateToParentState = function () {
            if ($state.current.parent) {
                $state.go($state.current.parent.name);
            } else {
                $state.go('home');
            }
        };
        vm.loginAs = function (role) {
            SessionService.verifyAs(role);
        };
        $rootScope.displayPromiseResult = function (result) {
            if (result.result === 'ok') {
                NotifyService.showSimpleToast(result.message);
            } else {
                NotifyService.showSimpleDialog(result.result, result.message);
            }
        };
        vm.updateTimeDisplay = function () {
            if (MonitorService.lastSyncedTime && vm.showNavbar) {
                //dont bother to update the gui if the diff is less than 0.66 seconds
                //otherwise there can be stutter sometimes
                if ($rootScope.lastSyncedTime && MonitorService.lastSyncedTime - $rootScope.lastSyncedTime < 0.66) {
                    return;
                }
                var utcTime = moment.utc(MonitorService.lastSyncedTime, 'X');
                var localTime = moment(MonitorService.lastSyncedTime, 'X');
                $rootScope.lastSyncedTime = MonitorService.lastSyncedTime;
                if (!$rootScope.utcDateTime) {
                    $rootScope.utcDateTime = utcTime.format('YYYY-MM-DD HH:mm:ss');
                    $rootScope.$emit('utcDateTimeSet', $rootScope.utcDateTime);
                } else {
                    $rootScope.utcDateTime = utcTime.format('YYYY-MM-DD HH:mm:ss');
                }
                $rootScope.utcDate = utcTime.toDate();
                $rootScope.utcTime = utcTime.format('HH:mm:ss');
                $rootScope.localTime = localTime.format('HH:mm:ss');
                $rootScope.currentDate = utcTime.format('YYYY-MM-DD');
                $rootScope.dayOfYear = utcTime.dayOfYear();

                var fractionalHours = utcTime.hours() + utcTime.minutes() / 60 + (utcTime.seconds() / 60) / 60;
                var julianDayWithTime = KatGuiUtil.julianDayWithTime(
                    utcTime.date(),
                    utcTime.month() + 1,
                    utcTime.year(),
                    fractionalHours);
                $rootScope.julianDay = Math.floor(julianDayWithTime * 100000) / 100000;
                $rootScope.localSiderealTime = MonitorService.lastSyncedLST;
                if (!$scope.$$phase) {
                    $scope.$digest();
                }
            }
        };
        $rootScope.objectKeys = function (obj) {
            if (obj) {
                return Object.keys(obj);
            } else {
                return [];
            }
        };
        $rootScope.openCentralLogger = function () {
            window.open('http://' + ConfigService.systemConfig.katportal.katlogwebserver).focus();
        };
        $rootScope.openGangliaLink = function () {
            window.open('http://' + ConfigService.systemConfig.nodes.monctl.split(' ')[0] + '/ganglia').focus();
        };
        $rootScope.openUrlInNewTab = function (url) {
            window.open(url).focus();
        };
        vm.openIRCDisplay = function ($event) {
            NotifyService.showPreDialog(
                'IRC Information',
                'IRC Server: irc://katfs.kat.ac.za:6667/#channel_name\n  IRC Logs: https://katfs.kat.ac.za/irclog/logs/katirc/\n',
                $event);
        };
        $rootScope.openSystemLogger = function () {
            if (ConfigService.GetKATLogFileServerURL()) {
                window.open(ConfigService.GetKATLogFileServerURL() + "/logfile/" + $rootScope.logNumberOfLines).focus();
            } else {
                NotifyService.showSimpleDialog('Error Viewing Logfiles', 'There is no KATLogFileServer IP defined in config, please contact CAM support.');
            }
        };
        $rootScope.openKatsnifferLogger = function (logFileName) {
            if (ConfigService.GetKATLogFileServerURL()) {
                window.open(ConfigService.GetKATLogFileServerURL() + "/logfile/" + logFileName + "/tail/" + $rootScope.logNumberOfLines).focus();
            } else {
                NotifyService.showSimpleDialog('Error Viewing Progress', 'There is no KATLogFileServer IP defined in config, please contact CAM support.');
            }
        };

        //todo material milestone v0.12 will have an option to not close menu when an item is clicked
        $rootScope.openMenu = function ($mdOpenMenu, $event, menuContentId) {
            var menu = $mdOpenMenu($event);
            $timeout(function() {
                var menuContent = document.getElementById(menuContentId);
                var included = ['INPUT'];
                menuContent.parentElement.addEventListener('click', function(e) {
                    if (included.indexOf(e.target.nodeName) > -1) {
                        e.stopPropagation();
                    } else {
                        return false;
                    }

                }, true);
            });
        };

        //so that all controllers and directives has access to which keys are pressed
        document.onkeydown = function (event) {
            event = event || window.event;
            $rootScope.$emit('keydown', event.keyCode);
        };

        $scope.$on('$destroy', function () {
            MonitorService.disconnectListener();
            vm.unbindLoginSuccess();
            if (vm.updateTimeDisplayInterval) {
                $interval.cancel(vm.updateTimeDisplayInterval);
            }
        });
    }

    function configureKatGui($stateProvider, $urlRouterProvider, $compileProvider, $mdThemingProvider,
                             $httpProvider, $urlMatcherFactoryProvider) {

        $urlMatcherFactoryProvider.strictMode(false);
        //disable this in production for performance boost
        //batarang uses this for scope inspection
        if (window.location.host !== 'localhost:8000') {
            $compileProvider.debugInfoEnabled(false);
        } else {
            $httpProvider.defaults.useXDomain = true;
            $httpProvider.defaults.withCredentials = true;
        }
        $urlRouterProvider.otherwise('/home');

        //todo nginx needs the following config before we can switch on html5Mode
        //https://github.com/angular-ui/ui-router/wiki/Frequently-Asked-Questions#how-to-configure-your-server-to-work-with-html5mode
        // $locationProvider.html5Mode({
        //     enabled: true,
        //     requireBase: false
        // });
        configureThemes($mdThemingProvider);

        $stateProvider.state('login', {
            url: '/login',
            templateUrl: 'app/login-form/login-form.html',
            title: 'Login'
        });
        $stateProvider.state('admin', {
            url: '/admin',
            templateUrl: 'app/admin/admin.html',
            title: 'User Admin'
        });
        $stateProvider.state('activity', {
            url: '/activity',
            templateUrl: 'app/activity/activity.html',
            title: 'Activity'
        });
        $stateProvider.state('alarms', {
            url: '/alarms',
            templateUrl: 'app/alarms/alarms.html',
            title: 'Alarms'
        });
        $stateProvider.state('config', {
            url: '/config',
            templateUrl: 'app/config/config.html',
            title: 'Configure katGUI'
        });
        $stateProvider.state('health', {
            url: '/health',
            templateUrl: 'app/health/health.html',
            title: 'Health & State'
        });
        $stateProvider.state('receptorHealth', {
            url: '/receptor-health',
            templateUrl: 'app/health/receptor-health/receptor-health.html',
            title: 'Receptor Health'
        });
        $stateProvider.state('config-health', {
            url: '/config-health/{configItem}',
            templateUrl: 'app/health/config-health-view/config-health-view.html',
            title: 'Config Health',
            params: {
                configItem: { value: null, squash: true }
            },
        });
        $stateProvider.state('config-health-pen', {
            url: '/config-health-pen',
            templateUrl: 'app/health/config-health-pen/config-health-pen.html',
            title: 'Config Health Pen'
        });
        $stateProvider.state('subarrayHealth', {
            url: '/subarray-health',
            templateUrl: 'app/health/subarray-health/subarray-health.html',
            title: 'Subarray Health'
        });
        $stateProvider.state('receptorStatus', {
            url: '/receptor-status',
            templateUrl: 'app/health/receptor-status/receptor-status.html',
            title: 'Receptor Status'
        });
        $stateProvider.state('receptorPointing', {
            url: '/receptor-pointing',
            templateUrl: 'app/health/receptor-pointing/receptor-pointing.html',
            title: 'Receptor Pointing'
        });
        $stateProvider.state('customHealth', {
            url: '/custom-health?layout',
            templateUrl: 'app/health/custom-health/custom-health.html',
            title: 'Custom Health'
        });
        $stateProvider.state('home', {
            url: '/home',
            templateUrl: 'app/landing/landing.html',
            title: 'Home'
        });
        $stateProvider.state('operator-control', {
            url: '/operator-control',
            templateUrl: 'app/operator-control/operator-control.html',
            title: 'Operator Control'
        });
        $stateProvider.state('process-control', {
            url: '/process-control',
            templateUrl: 'app/process-control/process-control.html',
            title: 'Process Control'
        });
        $stateProvider.state('cam-components', {
            url: '/cam-components',
            templateUrl: 'app/cam-components/cam-components.html',
            title: 'CAM Components'
        });
        $stateProvider.state('device-status', {
            url: '/device-status',
            templateUrl: 'app/device-status/device-status.html',
            title: 'Device Status'
        });
        $stateProvider.state('gui-links', {
            url: '/gui-links',
            templateUrl: 'app/gui-links/gui-links.html',
            title: 'GUI Links'
        });
        $stateProvider.state('instrumental-config', {
            url: '/instrumental-config',
            templateUrl: 'app/instrumental-config/instrumental-config.html',
            title: 'Instrumental Configuration'
        });

        var schedulerHome = {
            name: 'scheduler',
            url: '/scheduler',
            templateUrl: 'app/scheduler/scheduler-home.html',
            title: 'Subarrays'
        };
        var sbDrafts = {
            name: 'scheduler.drafts',
            parent: schedulerHome,
            url: '/drafts',
            templateUrl: 'app/scheduler/schedule-block-drafts/schedule-block-drafts.html',
            title: 'Scheduler.Approved Drafts'
        };
        var subArrays = {
            name: 'scheduler.subarrays',
            parent: schedulerHome,
            url: '/subarrays/:subarray_id',
            templateUrl: 'app/scheduler/subarrays-draft-assignment/subarrays-draft-assignment.html',
            title: 'Subarrays.Schedule Blocks'
        };
        var subArrayResources = {
            name: 'scheduler.resources',
            parent: schedulerHome,
            url: '/resources/:subarray_id',
            templateUrl: 'app/scheduler/subarray-resources/subarray-resources.html',
            title: 'Subarrays.Resources'
        };
        var observationsOverview = {
            name: 'scheduler.observations',
            parent: schedulerHome,
            url: '/observations',
            templateUrl: 'app/scheduler/observations/observations-overview.html',
            title: 'Subarrays.Overview'
        };
        var observationsDetail = {
            name: 'scheduler.observations.detail',
            parent: schedulerHome,
            url: '/observations/:subarray_id',
            templateUrl: 'app/scheduler/observations/observations-detail.html',
            title: 'Subarrays.Observations'
        };
        var programBlocks = {
            name: 'scheduler.program-blocks',
            parent: schedulerHome,
            url: '/program-blocks',
            template: '<program-blocks layout="column" flex program-blocks="vm.programBlocks"></program-blocks>',
            title: 'Scheduler.Program Blocks'
        };

        $stateProvider
            .state(schedulerHome)
            .state(sbDrafts)
            .state(subArrays)
            .state(subArrayResources)
            .state(observationsOverview)
            .state(observationsDetail)
            .state(programBlocks);

        $stateProvider.state('sensor-graph', {
            url: '/sensor-graph/{startTime}/{endTime}/{interval}/{sensors}/{discrete}',
            templateUrl: 'app/sensor-graph/sensor-graph.html',
            title: 'Sensor Graph',
            //makes the params optional
            params: {
                startTime: { value: null, squash: true },
                endTime: { value: null, squash: true },
                interval: { value: null, squash: true },
                sensors: { value: null, squash: true },
                discrete: { value: null, squash: true }
            },
            noAuth: true
        });
        $stateProvider.state('sensor-list', {
            url: '/sensor-list',
            templateUrl: 'app/sensor-list/sensor-list.html',
            title: 'Sensor List'
        });
        $stateProvider.state('sensor-groups', {
            url: '/sensor-groups',
            templateUrl: 'app/sensor-groups/sensor-groups.html',
            title: 'Sensor Groups'
        });
        $stateProvider.state('about', {
            url: '/about',
            templateUrl: 'app/about/about.html',
            title: 'About'
        });
        $stateProvider.state('video', {
            url: '/video',
            templateUrl: 'app/video/video.html',
            title: 'Video'
        });
        $stateProvider.state('weather', {
            url: '/weather',
            templateUrl: 'app/weather/weather.html',
            title: 'Weather'
        });
        $stateProvider.state('userlogs', {
            url: '/userlogs',
            templateUrl: 'app/userlogs/userlogs.html',
            title: 'User Logging'
        });
        $stateProvider.state('userlog-tags', {
            url: '/userlog-tags',
            templateUrl: 'app/userlogs/userlog-tags.html',
            title: 'User Log Tag Management'
        });
        $stateProvider.state('userlog-reports', {
            url: '/userlog-reports/{startTime}/{endTime}/{tagIds}/{filter}',
            templateUrl: 'app/userlogs/userlog-reports.html',
            //makes the params optional
            params: {
                startTime: { value: null, squash: true },
                endTime: { value: null, squash: true },
                tagIds: { value: null, squash: true },
                filter: { value: null, squash: true }
            },
            title: 'User Log Reports'
        });
        $stateProvider.state('utilisation-report', {
            url: '/utilisation-report/{startTime}/{endTime}/{filter}',
            templateUrl: 'app/reports/utilisation-report.html',
            //makes the params optional
            params: {
                startTime: { value: null, squash: true },
                endTime: { value: null, squash: true },
                filter: { value: null, squash: true }
            },
            title: 'Utilisation Report'
        });
        /* Add New States Above */
    }

    function runKatGui($rootScope, $state, $localStorage, $log, $templateCache) {

        $rootScope.$on('$stateChangeStart', function (event, toState) {
            if (!toState.noAuth) {
                if (!$rootScope.loggedIn && toState.name !== 'login') {
                    if (!$localStorage['currentUserToken']) {
                        event.preventDefault();
                        $rootScope.requestedStateBeforeLogin = toState.name;
                        $state.go('login');
                    }
                } else if ($rootScope.loggedIn && $rootScope.requestedStateBeforeLogin) {
                    var newStateName = $rootScope.requestedStateBeforeLogin ? $rootScope.requestedStateBeforeLogin : 'home';
                    $rootScope.requestedStateBeforeLogin = null;
                    event.preventDefault();
                    $state.go(newStateName);
                }
            }
        });

        $rootScope.$on('$routeChangeStart', function(event, next, current) {
            if (typeof(current) !== 'undefined'){
                $templateCache.remove(current.templateUrl);
            }
        });

        $rootScope.$on('$stateChangeError', function (event) {
            $log.error('$stateChangeError - debugging required. Event: ');
            $log.error(event);
        });
    }

    //this function includes the style sheets instead of having to link to each individually
    function configureThemes($mdThemingProvider) {
        //$mdThemingProvider.theme('default')
        //    .primaryPalette('indigo');
        //
        $mdThemingProvider.theme('indigo')
            .primaryPalette('indigo')
            .accentPalette('blue');

        $mdThemingProvider.theme('blue')
            .primaryPalette('blue')
            .accentPalette('indigo');

        $mdThemingProvider.theme('red')
            .primaryPalette('red')
            .accentPalette('blue');

        $mdThemingProvider.theme('green')
            .primaryPalette('green')
            .accentPalette('blue');

        $mdThemingProvider.theme('blue-grey')
            .primaryPalette('blue-grey')
            .accentPalette('blue');

        $mdThemingProvider.theme('grey')
            .primaryPalette('grey')
            .accentPalette('blue');

        $mdThemingProvider.theme('deep-purple')
            .primaryPalette('deep-purple')
            .accentPalette('purple');

        $mdThemingProvider.theme('purple')
            .primaryPalette('purple')
            .accentPalette('blue');

        $mdThemingProvider.theme('teal')
            .primaryPalette('teal')
            .accentPalette('blue');

        $mdThemingProvider.theme('yellow')
            .primaryPalette('yellow')
            .accentPalette('blue');

        $mdThemingProvider.theme('amber')
            .primaryPalette('amber')
            .accentPalette('blue');

        $mdThemingProvider.definePalette('white', $mdThemingProvider.extendPalette('blue', {'400': 'ffffff'}));
        $mdThemingProvider.theme('white')
            .primaryPalette('white', {
                'default': '400'
            });

        $mdThemingProvider.theme('dark')
            .primaryPalette('blue-grey')
            .dark();

        $mdThemingProvider.theme('dark-secondary')
            .primaryPalette('indigo')
            .dark();

        $mdThemingProvider.theme('dark-buttons')
            .primaryPalette('blue')
            .dark();

        $mdThemingProvider.alwaysWatchTheme(true);
    }
})();
