(function() {

    angular.module('katGui.scheduler', ['ui.bootstrap.datetimepicker',
            'katGui.services',
            'katGui.util',
            'ngAnimate'
        ])
        .constant('SCHEDULE_BLOCK_TYPES', [
            'MAINTENANCE',
            'OBSERVATION',
            'MANUAL'
        ])
        .controller('SchedulerHomeCtrl', SchedulerHomeCtrl);

    function SchedulerHomeCtrl($state, $rootScope, $scope, $interval, $log, ObsSchedService, $timeout, KatGuiUtil,
        UserLogService, NotifyService, MonitorService, ConfigService, $stateParams, $q, $mdDialog, UserService) {

        var vm = this;
        vm.childStateShowing = $state.current.name !== 'scheduler';
        vm.subarrays = ObsSchedService.subarrays;
        vm.programBlocks = ObsSchedService.programBlocks;
        vm.connectionLost = false;
        vm.subarray = null;
        vm.products = [];
        vm.bandsMap = {};
        vm.dumpRatesMap = {};
        vm.defaultDumpRatesMap = {};
        vm.bands = [];
        vm.users = [];
        vm.resourceBusyStates = ['deactivating', 'configuring', 'configured', 'activating'];
        vm.iAmCA = false;
        vm.modeTypes = ['queue', 'manual', 'auto'];
        vm.guiUrls = ObsSchedService.guiUrls;
        vm.subscribedSensors = [];
        vm.sensorsRegex = '';
        vm.sensorValues = ObsSchedService.sensorValues;
        vm.subarraySensorNames = [
            "subarray_._allocations",
            "subarray_._product",
            "subarray_._state",
            "subarray_._band",
            "subarray_._config_label",
            "subarray_._maintenance",
            "subarray_._delegated_ca",
            "subarray_._pool_resources",
            "subarray_._number_ants",
            "subarray_._dump_rate"
        ];
        vm.schedSensorNames = [
            'sched_mode_\\d$'
        ];
        vm.katpoolSensorNames = [
            'katpool_pool_resources_free',
            'katpool_resources_faulty',
            'katpool_resources_in_maintenance'
        ];

        if (!$stateParams.subarray_id) {
            $state.go($state.current.name, {
                subarray_id: '1'
            });
        }

        UserService.listUsers().then(function() {
            for (var i = 0; i < UserService.users.length; i++) {
                vm.users.push(UserService.users[i]);
            }
        });

        UserLogService.listTags();

        ConfigService.getSystemConfig()
            .then(function(systemConfig) {
                ObsSchedService.subarrays.splice(0, ObsSchedService.subarrays.length);
                systemConfig.subarrayNrs.forEach(function(subNr) {
                    ObsSchedService.subarrays.push({
                        id: subNr,
                        name: 'subarray_' + subNr
                    });
                });
                vm.subarrays = ObsSchedService.subarrays;
                vm.initSensors();
                if (systemConfig.system.bands) {
                    vm.bands = systemConfig.system.bands.split(',');
                } else {
                    NotifyService.showSimpleDialog('Error loading bands and products',
                        'Bands and products were not found in the system\'s config.');
                }
            });

        ConfigService.getProductConfig()
            .then(function(productConfig) {
                vm.products = [];
                vm.dumpRatesMap = {};
                vm.defaultDumpRatesMap = {};
                var productKeys = Object.keys(productConfig);
                productKeys.forEach(function(product) {
                    vm.products.push({
                        name: product,
                        sp_product: productConfig[product].sp_product,
                        cbf_product: productConfig[product].cbf_product
                    });
                    if (productConfig[product].allowed_dumprates) {
                        vm.dumpRatesMap[product] = productConfig[product].allowed_dumprates.split(',').map(
                            function(dumpRate) {
                                return {
                                    hz: dumpRate,
                                    seconds: Math.round(1e2 / dumpRate) / 1e2
                                };
                            });
                    } else {
                        vm.dumpRatesMap[product] = [{
                            hz: productConfig[product].default_dumprate,
                            seconds:  Math.round(1e2 / productConfig[product].default_dumprate) / 1e2
                        }];
                    }
                    vm.defaultDumpRatesMap[product] = productConfig[product].default_dumprate;
                    if (productConfig[product].allowed_bands) {
                        vm.bandsMap[product] = productConfig[product].allowed_bands.split(',');
                    } else {
                        vm.bandsMap[product] = [];
                    }
                });
            });

        vm.iAmAtLeastCA = function() {
            return $rootScope.expertOrLO || vm.iAmCA;
        };

        vm.stateGo = function(newState, subarray_id) {
            if (subarray_id) {
                $state.go(newState, {
                    subarray_id: subarray_id
                });
                vm.subarray = _.findWhere(ObsSchedService.subarrays, {
                    id: subarray_id
                });
            } else if (vm.subarray) {
                $state.go(newState, {
                    subarray_id: vm.subarray.id
                });
            } else if (newState === 'scheduler.observations' || newState === 'scheduler.drafts' ||
                newState === 'scheduler.program-blocks') {
                $state.go(newState);
            } else {
                $state.go('scheduler');
            }
        };

        vm.unbindStateChangeStart = $rootScope.$on('$stateChangeStart', function(event, toState) {
            vm.childStateShowing = (toState.name === 'scheduler.drafts' ||
                toState.name === 'scheduler.resources' ||
                toState.name === 'scheduler.execute' ||
                toState.name === 'scheduler.subarrays' ||
                toState.name === 'scheduler.observations' ||
                toState.name === 'scheduler.observations.detail' ||
                toState.name === 'scheduler.program-blocks');

            if (toState.name === 'scheduler.observations' ||
                toState.name === 'scheduler.drafts' ||
                toState.name === 'scheduler.program-blocks' ||
                toState.name === 'scheduler') {
                vm.subarray = null;
            } else {
                vm.subarray = _.findWhere(ObsSchedService.subarrays, {
                    id: vm.subarray_id
                });
            }
        });

        vm.currentState = function() {
            return $state.current.name;
        };

        ObsSchedService.getProgramBlocks();
        ObsSchedService.getScheduleBlocks();
        ObsSchedService.getProgramBlocksObservationSchedule();

        vm.checkCASubarrays = function() {
            vm.subarray = _.findWhere(ObsSchedService.subarrays, {
                id: $stateParams.subarray_id
            });
            if (vm.subarray && $rootScope.currentUser) {
                vm.iAmCA = vm.subarray.delegated_ca === $rootScope.currentUser.email && $rootScope.currentUser.req_role === 'control_authority';
            }
        };

        vm.checkCASubarrays();
        if (!vm.subarray) {
            vm.unbindWatchSubarrays = $scope.$watchCollection('vm.subarrays', function() {
                vm.checkCASubarrays();
            });
        }

        vm.unbindDelegateWatch = $scope.$watch('vm.subarray.delegated_ca', function(newVal) {
            vm.checkCASubarrays();
        });

        vm.unbindLoginSuccess = $rootScope.$on('loginSuccess', function() {
            vm.checkCASubarrays();
        });

        vm.waitForSubarrayToExist = function() {
            vm.waitForSubarrayToExistDeferred = $q.defer();
            if (vm.subarray) {
                $timeout(function() {
                    vm.waitForSubarrayToExistDeferred.resolve($stateParams.subarray_id);
                }, 1);
            } else {
                vm.waitForSubarrayToExistInterval = $interval(function() {
                    if (!vm.subarray && $stateParams.subarray_id) {
                        vm.checkCASubarrays();
                    }
                    if (vm.subarray) {
                        vm.waitForSubarrayToExistDeferred.resolve($stateParams.subarray_id);
                        $interval.cancel(vm.waitForSubarrayToExistInterval);
                        vm.waitForSubarrayToExistInterval = null;
                    }
                }, 50);
            }
            return vm.waitForSubarrayToExistDeferred.promise;
        };

        vm.openConfigLabelDialog = function(event) {
            $mdDialog
                .show({
                    controller: function($rootScope, $scope, $mdDialog) {
                        $scope.title = 'Select a Config Label';
                        $scope.configLabels = ObsSchedService.configLabels;
                        ObsSchedService.listConfigLabels();
                        $scope.configLabelsFields = [{
                                label: 'date',
                                value: 'date'
                            },
                            {
                                label: 'name',
                                value: 'name'
                            }
                        ];
                        $scope.hide = function() {
                            $mdDialog.hide();
                        };
                        $scope.setConfigLabel = function(configLabel) {
                            ObsSchedService.setConfigLabel(vm.subarray.id, configLabel);
                        };
                    },
                    template: '<md-dialog style="padding: 0;" md-theme="{{$root.themePrimary}}">' +
                        '   <div style="padding: 0; margin: 0; overflow: auto" layout="column">' +
                        '       <md-toolbar class="md-primary" layout="row" layout-align="center center">' +
                        '           <span flex style="margin-left: 8px;">{{::title}}</span>' +
                        '           <input type="search" style="font-size: 14px; margin-left: 8px; width: 140px; background: transparent; border: 0" ng-model="q" placeholder="Search Labels..."/>' +
                        '       </md-toolbar>' +
                        '       <div flex layout="column" style="overflow-x: auto; overflow-y: scroll">' +
                        '           <div style="text-align: center" class="config-label-list-item" ng-click="setConfigLabel(\'\');  hide()">Clear Config Label</div>' +
                        '           <div layout="row" ng-repeat="configLabel in configLabels | regexSearch:configLabelsFields:q track by $index" ng-click="setConfigLabel(configLabel); hide()" class="config-label-list-item">' +
                        '               <div>{{configLabel}}</div>' +
                        '           </div>' +
                        '       </div>' +
                        '       <div layout="row" layout-align="end" style="margin-top: 8px; margin-right: 8px; margin-bottom: 8px; min-height: 40px;">' +
                        '           <md-button style="margin-left: 8px;" class="md-primary md-raised" md-theme="{{$root.themePrimaryButtons}}" aria-label="OK" ng-click="hide()">Close</md-button>' +
                        '       </div>' +
                        '   </div>' +
                        '</md-dialog>',
                    targetEvent: event
                });
        };

        vm.setBand = function(band) {
            ObsSchedService.setBand(vm.subarray.id, band);
        };

        vm.openBandsDialog = function(event) {
            $mdDialog
                .show({
                    controller: function($rootScope, $scope, $mdDialog) {
                        $scope.title = 'Select a Band';
                        $scope.bands = vm.bands;

                        $scope.hide = function() {
                            $mdDialog.hide();
                        };
                        $scope.setBand = function(band) {
                            vm.setBand(band);
                        };
                    },
                    template: '<md-dialog style="padding: 0;" md-theme="{{$root.themePrimary}}">' +
                        '   <div style="padding: 0; margin: 0; overflow: auto" layout="column">' +
                        '       <md-toolbar class="md-primary" layout="row" layout-align="center center">' +
                        '           <span flex style="margin-left: 8px;">{{::title}}</span>' +
                        '       </md-toolbar>' +
                        '       <div flex layout="column" style="overflow-x: auto; overflow-y: scroll">' +
                        '           <div layout="row" layout-align="center center" ng-repeat="band in bands track by $index" ng-click="setBand(band); hide()" class="config-label-list-item">' +
                        '               <b>{{band}}</b>' +
                        '           </div>' +
                        '       </div>' +
                        '       <div layout="row" layout-align="end" style="margin-top: 8px; margin-right: 8px; margin-bottom: 8px; min-height: 40px;">' +
                        '           <md-button style="margin-left: 8px;" class="md-primary md-raised" md-theme="{{$root.themePrimaryButtons}}" aria-label="OK" ng-click="hide()">Close</md-button>' +
                        '       </div>' +
                        '   </div>' +
                        '</md-dialog>',
                    targetEvent: event
                });
        };

        vm.setProduct = function(product) {
            if (!product || product.length === 0) {
                ObsSchedService.setProduct(vm.subarray.id, '');
            }
            else if (vm.bandsMap[product].length > 0) {
                ObsSchedService.setProduct(vm.subarray.id, product, vm.defaultDumpRatesMap[product]);
                if (vm.bandsMap[product].indexOf(vm.subarray.band) === -1) {
                    vm.setBand(vm.bandsMap[product][0]);
                }
            } else {
                NotifyService.showSimpleDialog(
                    'Error setting the product',
                    'The selected product does not have any allowable bands configured. Cannot set the product ' + product + '.');
            }
        };

        vm.setDumpRate = function(dumpRate) {
            if (vm.subarray.product) {
                ObsSchedService.setProduct(vm.subarray.id, vm.subarray.product, dumpRate);
            } else {
                NotifyService.showSimpleDialog(
                    'Error setting the dump rate', 'Please select a product before selecting a dump rate');
            }
        };

        vm.openProductsDialog = function(event) {
            $mdDialog
                .show({
                    controller: function($rootScope, $scope, $mdDialog) {
                        $scope.title = 'Select a Product';
                        $scope.products = vm.products;

                        $scope.hide = function() {
                            $mdDialog.hide();
                        };
                        $scope.setProduct = function(product) {
                            vm.setProduct(product);
                        };
                    },
                    template: '<md-dialog style="padding: 0;" md-theme="{{$root.themePrimary}}">' +
                        '   <div style="padding: 0; margin: 0; overflow: auto" layout="column">' +
                        '       <md-toolbar class="md-primary" layout="row" layout-align="center center">' +
                        '           <span flex style="margin-left: 8px;">{{::title}}</span>' +
                        '       </md-toolbar>' +
                        '       <div flex layout="column" style="overflow-x: auto; overflow-y: scroll">' +
                        '           <div layout="row" layout-align="center center" ng-repeat="product in products | orderBy:\'name\':true track by $index" ng-click="setProduct(product.name); hide()" class="config-label-list-item" title="{{\'SP Product: \' + product.sp_product + \', CBF Product: \' + product.cbf_product}}">' +
                        '               <b>{{product.name}}</b>' +
                        '           </div>' +
                        '       </div>' +
                        '       <div layout="row" layout-align="end" style="margin-top: 8px; margin-right: 8px; margin-bottom: 8px; min-height: 40px;">' +
                        '           <md-button style="margin-left: 8px;" class="md-primary md-raised" md-theme="{{$root.themePrimaryButtons}}" aria-label="OK" ng-click="hide()">Close</md-button>' +
                        '       </div>' +
                        '   </div>' +
                        '</md-dialog>',
                    targetEvent: event
                });
        };

        vm.openCADialog = function(event) {
            $mdDialog
                .show({
                    controller: function($rootScope, $scope, $mdDialog) {
                        $scope.title = 'Select a Control Authority';
                        UserService.listUsers();
                        $scope.users = UserService.users;

                        $scope.hide = function() {
                            $mdDialog.hide();
                        };
                        $scope.setCA = function(userName) {
                            ObsSchedService.delegateControl(vm.subarray.id, userName);
                        };
                        $scope.hasCARole = function(user) {
                            return user.roles.indexOf('control_authority') > -1;
                        };
                    },
                    template: '<md-dialog style="padding: 0;" md-theme="{{$root.themePrimary}}">' +
                        '   <div style="padding: 0; margin: 0; overflow: auto" layout="column">' +
                        '       <md-toolbar class="md-primary" layout="row" layout-align="center center">' +
                        '           <span flex style="margin-left: 8px;">{{::title}}</span>' +
                        '       </md-toolbar>' +
                        '       <div flex layout="column" style="overflow-x: auto; overflow-y: scroll">' +
                        '           <div layout="row" layout-align="center center" ng-click="setCA(\'lo\'); hide()" class="config-label-list-item">' +
                        '               <b>Lead Operator</b>' +
                        '           </div>' +
                        '           <div ng-if="hasCARole(user)" layout="row" layout-align="center center" ng-repeat="user in users track by $index" ng-click="setCA(user.email); hide()" class="config-label-list-item">' +
                        '               <b>{{user.email}}</b>' +
                        '           </div>' +
                        '       </div>' +
                        '       <div layout="row" layout-align="end" style="margin-top: 8px; margin-right: 8px; margin-bottom: 8px; min-height: 40px;">' +
                        '           <md-button style="margin-left: 8px;" class="md-primary md-raised" md-theme="{{$root.themePrimaryButtons}}" aria-label="OK" ng-click="hide()">Close</md-button>' +
                        '       </div>' +
                        '   </div>' +
                        '</md-dialog>',
                    targetEvent: event
                });
        };

        vm.setSubarrayInMaintenance = function() {
            ObsSchedService.setSubarrayMaintenance(
                vm.subarray.id, vm.sensorValues[vm.subarray.name + '_maintenance'].value ? 'clear' : 'set');
        };

        vm.markResourceFaulty = function(resourceName) {
            ObsSchedService.markResourceFaulty(
                resourceName, vm.isResourceFaulty(resourceName) ? 'clear' : 'set');
        };

        vm.markResourceInMaintenance = function(resourceName) {
            ObsSchedService.markResourceInMaintenance(
                resourceName, vm.isResourceInMaintenance(resourceName) ? 'clear' : 'set');
        };

        vm.isResourceInMaintenance = function(resourceName) {
            return vm.sensorValues['katpool_resources_in_maintenance'] &&
                vm.sensorValues['katpool_resources_in_maintenance'].value.indexOf(resourceName) > -1;
        };

        vm.isResourceFaulty = function(resourceName) {
            return vm.sensorValues['katpool_resources_faulty'] &&
                vm.sensorValues['katpool_resources_faulty'].value.indexOf(resourceName) > -1;
        };

        vm.activateSubarray = function() {
            vm.subarray.showProgress = true;
            ObsSchedService.activateSubarray(vm.subarray.id)
                .then(function(result) {
                    var splitMessage = result.data.result.split(' ');
                    var message = KatGuiUtil.sanitizeKATCPMessage(result.data.result);
                    if (splitMessage.length > 2 && splitMessage[1] !== 'ok') {
                        NotifyService.showPreDialog('Error activating subarray', message);
                    } else {
                        NotifyService.showSimpleToast(result.data.result);
                    }
                    vm.subarray.showProgress = false;
                }, function(error) {
                    NotifyService.showSimpleDialog('Could not activate Subarray', error.data.result);
                    vm.subarray.showProgress = false;
                });
        };

        vm.freeSubarray = function() {
            ObsSchedService.freeSubarray(vm.subarray.id);
        };

        vm.listResourceMaintenanceDevicesDialog = function(resourceName, $event) {
            ObsSchedService.listResourceMaintenanceDevicesDialog(vm.subarray.id, resourceName, $event);
        };

        vm.delegateControl = function(email) {
            ObsSchedService.delegateControl(vm.subarray.id, email);
        };

        vm.executeSchedule = function(item) {
            if (vm.iAmAtLeastCA() && !item.pendingVerify && item.state !== 'ACTIVE' && item.obs_readiness === 'READY_TO_EXECUTE') {
                ObsSchedService.executeSchedule(item.sub_nr, item.id_code);
            }
        };

        vm.stopExecuteSchedule = function(item) {
            if (vm.iAmAtLeastCA() && item.state === 'ACTIVE') {
                ObsSchedService.stopSchedule(item.sub_nr, item.id_code);
            }
        };

        vm.cancelExecuteSchedule = function(item) {
            if (vm.iAmAtLeastCA() && item.state === 'ACTIVE') {
                ObsSchedService.cancelExecuteSchedule(item.sub_nr, item.id_code);
            }
        };

        vm.cloneSB = function(item) {
            ObsSchedService.cloneSB(item.id_code);
        };

        vm.clonePB = function(pb, cloneSBs) {
            ObsSchedService.clonePB(pb, cloneSBs);
        };

        vm.cloneSBIntoPBDialog = function(event, sb) {
            $mdDialog
                .show({
                    controller: function($scope, $mdDialog) {
                        $scope.title = 'Select a Program Block to Clone SB ' + sb.id_code + ' into...';
                        $scope.programBlocks = vm.programBlocks;
                        $scope.sb = sb;
                        $scope.selectedPB = null;
                        $scope.acceptButtonText = 'Clone into PB';

                        $scope.setSelectedPB = function(pb) {
                            $scope.selectedPB = $scope.selectedPB === pb ? null : pb;
                        };

                        $scope.acceptDialogAction = function() {
                            ObsSchedService.cloneSBIntoPB($scope.sb, $scope.selectedPB).then(
                                function(updateResult) {
                                    if (updateResult.data.error) {
                                        NotifyService.showPreDialog('Error cloning SB into PB', updateResult.data.error);
                                    } else {
                                        NotifyService.showSimpleToast('Cloned SB ' + sb.id_code + ' into PB ' + $scope.selectedPB.pb_id);
                                    }
                                },
                                function(error) {
                                    NotifyService.showPreDialog('Error cloning SB into PB', error);
                                });
                            $mdDialog.hide();
                        };

                        $scope.hide = function() {
                            $mdDialog.hide();
                        };
                    },
                    templateUrl: 'app/scheduler/templates/program-block-select.html',
                    targetEvent: event
                });
        };

        vm.moveSBIntoPBDialog = function(event, sb) {
            $mdDialog
                .show({
                    controller: function($scope, $mdDialog) {
                        $scope.title = 'Select a Program Block to move SB ' + sb.id_code + ' into...';
                        $scope.programBlocks = vm.programBlocks;
                        $scope.sb = sb;
                        $scope.selectedPB = null;
                        $scope.acceptButtonText = 'Move into PB';

                        $scope.setSelectedPB = function(pb) {
                            $scope.selectedPB = $scope.selectedPB === pb ? null : pb;
                        };

                        $scope.acceptDialogAction = function() {
                            ObsSchedService.updateScheduleBlockWithProgramBlockID(sb, $scope.selectedPB).then(
                                function(updateResult) {
                                    if (updateResult.data.error) {
                                        NotifyService.showPreDialog('Error moving SB into PB', updateResult.data.error);
                                    } else {
                                        NotifyService.showSimpleToast('Moved SB ' + sb.id_code + ' into PB ' + $scope.selectedPB.pb_id);
                                    }
                                },
                                function(error) {
                                    NotifyService.showPreDialog('Error moving SB into PB', error);
                                });
                            $mdDialog.hide();
                        };

                        $scope.hide = function() {
                            $mdDialog.hide();
                        };
                    },
                    templateUrl: 'app/scheduler/templates/program-block-select.html',
                    targetEvent: event
                });
        };

        vm.leadOperatorPriorityDialog = function(sb, event) {
            var initValue = sb.lead_operator_priority;
            if (initValue !== null && initValue > -1) {
                initValue = initValue.toString();
            } else {
                initValue = '';
            }
            var confirm = $mdDialog.prompt()
                .title('Set Lead Operator Priority for ' + sb.id_code)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('Lead Operator Priority')
                .ariaLabel('Lead Operator Priority')
                .initialValue(initValue)
                .targetEvent(event)
                .theme($rootScope.themePrimaryButtons)
                .ok('Save')
                .cancel('Cancel');

            $mdDialog.show(confirm).then(function(result) {
                var parsedResult = parseInt(result);
                if (result !== '' && result !== 'none' && (isNaN(parsedResult) || parsedResult < 0 || parsedResult > 100)) {
                    vm.leadOperatorPriorityDialog(sb);
                } else if (result === 'none' || result === '' || parsedResult > -1 || parsedResult < 101) {
                    if (result === '') {
                        result = 'none';
                    }
                    ObsSchedService.updateSBOrderingValues(
                        sb.id_code, result, sb.sb_order, sb.sb_sequence).then(
                        function(updateResult) {
                            if (updateResult.data.error) {
                                NotifyService.showPreDialog('Error updating Lead Operator Priority', updateResult.data.error);
                            } else {
                                NotifyService.showSimpleToast('Updated SB ' + sb.id_code + ' lead_operator_priority to ' + updateResult.data.result.lead_operator_priority);
                            }
                        },
                        function(error) {
                            NotifyService.showPreDialog('Error updating Lead Operator Priority', error);
                        });
                }
            }, function() {
                NotifyService.showSimpleToast('Cancelled Lead Operator Priority edit for ' + sb.id_code);
            });
        };

        vm.sbOrderDialog = function(sb, event) {
            var initValue = sb.sb_order;
            if (initValue !== null && initValue > -1) {
                initValue = initValue.toString();
            } else {
                initValue = '';
            }
            var confirm = $mdDialog.prompt()
                .title('Set SB Order for ' + sb.id_code)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('SB Order')
                .ariaLabel('SB Order')
                .initialValue(initValue)
                .targetEvent(event)
                .theme($rootScope.themePrimaryButtons)
                .ok('Save')
                .cancel('Cancel');

            $mdDialog.show(confirm).then(function(result) {
                var parsedResult = parseInt(result);
                if (result !== '' && result !== 'none' && (isNaN(parsedResult) || parsedResult < 0 || parsedResult > 100)) {
                    vm.sbOrderDialog(sb);
                } else if (result === 'none' || result === '' || parsedResult > -1 || parsedResult < 101) {
                    if (result === '') {
                        result = 'none';
                    }
                    ObsSchedService.updateSBOrderingValues(
                        sb.id_code, sb.lead_operator_priority, result, sb.sb_sequence).then(
                        function(updateResult) {
                            if (updateResult.data.error) {
                                NotifyService.showPreDialog('Error updating SB Order', updateResult.data.error);
                            } else {
                                NotifyService.showSimpleToast('Updated SB ' + sb.id_code + ' sb_order to ' + updateResult.data.result.sb_order);
                            }
                        },
                        function(error) {
                            NotifyService.showPreDialog('Error updating SB Order', error);
                        });
                }
            }, function() {
                NotifyService.showSimpleToast('Cancelled SB Order edit for ' + sb.id_code);
            });
        };

        vm.sbSequenceDialog = function(sb, event) {
            var initValue = sb.sb_sequence;
            if (initValue !== null && initValue > -1) {
                initValue = initValue.toString();
            } else {
                initValue = '';
            }
            var confirm = $mdDialog.prompt()
                .title('Set SB Sequence for ' + sb.id_code)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('SB Sequence')
                .ariaLabel('SB Sequence')
                .initialValue(initValue)
                .targetEvent(event)
                .theme($rootScope.themePrimaryButtons)
                .ok('Save')
                .cancel('Cancel');

            $mdDialog.show(confirm).then(function(result) {
                var parsedResult = parseInt(result);
                if (result !== '' && result !== 'none' && (isNaN(parsedResult) || parsedResult < 0 || parsedResult > 100)) {
                    vm.sbSequenceDialog(sb);
                } else if (result === 'none' || result === '' || parsedResult > -1 || parsedResult < 101) {
                    if (result === '') {
                        result = 'none';
                    }
                    ObsSchedService.updateSBOrderingValues(
                        sb.id_code, sb.lead_operator_priority, sb.sb_order, result).then(
                        function(updateResult) {
                            if (updateResult.data.error) {
                                NotifyService.showPreDialog('Error updating SB Sequence', updateResult.data.error);
                            } else {
                                NotifyService.showSimpleToast('Updated SB ' + sb.id_code + ' sb_sequence to ' + updateResult.data.result.sb_sequence);
                            }

                        },
                        function(error) {
                            NotifyService.showPreDialog('Error updating SB Sequence', error);
                        });
                }
            }, function() {
                NotifyService.showSimpleToast('Cancelled SB Order edit for ' + sb.id_code);
            });
        };

        vm.directorPriorityDialog = function(pb, event) {
            var initValue = pb.director_priority;
            if (initValue !== null && initValue > -1) {
                initValue = initValue.toString();
            } else {
                initValue = '';
            }
            var confirm = $mdDialog.prompt()
                .title('Set Director Priority for ' + pb.pb_id)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('Director Priority')
                .ariaLabel('Director Priority')
                .initialValue(initValue)
                .targetEvent(event)
                .theme($rootScope.themePrimaryButtons)
                .ok('Save')
                .cancel('Cancel');

            $mdDialog.show(confirm).then(function(result) {
                var parsedResult = parseInt(result);
                if (result !== '' && result !== 'none' && (isNaN(parsedResult) || parsedResult < 0 || parsedResult > 100)) {
                    vm.directorPriorityDialog(pb);
                } else if (result === 'none' || result === '' || parsedResult > -1 || parsedResult < 101) {
                    if (result === '') {
                        result = 'none';
                    }
                    ObsSchedService.updatePBOrderingValues(
                        pb.pb_id, result, pb.pb_order, pb.pb_sequence).then(
                        function(updateResult) {
                            if (updateResult.data.error) {
                                NotifyService.showPreDialog('Error updating Director Priority', updateResult.data.error);
                            } else {
                                NotifyService.showSimpleToast('Updated SB ' + pb.pb_id + ' director_priority to ' + updateResult.data.result.director_priority);
                            }
                        },
                        function(error) {
                            NotifyService.showPreDialog('Error updating Director Priority', error);
                        });
                }
            }, function() {
                NotifyService.showSimpleToast('Cancelled Director Priority edit for ' + pb.pb_id);
            });
        };

        vm.pbOrderDialog = function(pb, event) {
            var initValue = pb.pb_order;
            if (initValue !== null && initValue > -1) {
                initValue = initValue.toString();
            } else {
                initValue = '';
            }
            var confirm = $mdDialog.prompt()
                .title('Set PB Order for ' + pb.pb_id)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('PB Order')
                .ariaLabel('PB Order')
                .initialValue(initValue)
                .targetEvent(event)
                .theme($rootScope.themePrimaryButtons)
                .ok('Save')
                .cancel('Cancel');

            $mdDialog.show(confirm).then(function(result) {
                var parsedResult = parseInt(result);
                if (result !== '' && result !== 'none' && (isNaN(parsedResult) || parsedResult < 0 || parsedResult > 100)) {
                    vm.pbOrderDialog(pb);
                } else if (result === 'none' || result === '' || parsedResult > -1 || parsedResult < 101) {
                    if (result === '') {
                        result = 'none';
                    }
                    ObsSchedService.updatePBOrderingValues(
                        pb.pb_id, pb.director_priority, result, pb.pb_sequence).then(
                        function(updateResult) {
                            if (updateResult.data.error) {
                                NotifyService.showPreDialog('Error updating PB Order', updateResult.data.error);
                            } else {
                                NotifyService.showSimpleToast('Updated PB ' + pb.pb_id + ' pb_order to ' + updateResult.data.result.pb_order);
                            }
                        },
                        function(error) {
                            NotifyService.showPreDialog('Error updating PB Order', error);
                        });
                }
            }, function() {
                NotifyService.showSimpleToast('Cancelled PB Order edit for ' + pb.pb_id);
            });
        };

        vm.pbSequenceDialog = function(pb, event) {
            var initValue = pb.pb_sequence;
            if (initValue !== null && initValue > -1) {
                initValue = initValue.toString();
            } else {
                initValue = '';
            }
            var confirm = $mdDialog.prompt()
                .title('Set PB Sequence for ' + pb.pb_id)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('PB Sequence')
                .ariaLabel('PB Sequence')
                .initialValue(initValue)
                .targetEvent(event)
                .theme($rootScope.themePrimaryButtons)
                .ok('Save')
                .cancel('Cancel');

            $mdDialog.show(confirm).then(function(result) {
                var parsedResult = parseInt(result);
                if (result !== '' && result !== 'none' && (isNaN(parsedResult) || parsedResult < 0 || parsedResult > 100)) {
                    vm.pbSequenceDialog(pb);
                } else if (result === 'none' || result === '' || parsedResult > -1 || parsedResult < 101) {
                    if (result === '') {
                        result = 'none';
                    }
                    ObsSchedService.updatePBOrderingValues(
                        pb.pb_id, pb.director_priority, pb.pb_order, result).then(
                        function(updateResult) {
                            if (updateResult.data.error) {
                                NotifyService.showPreDialog('Error updating PB Sequence', updateResult.data.error);
                            } else {
                                NotifyService.showSimpleToast('Updated PB ' + pb.pb_id + ' pb_sequence to ' + updateResult.data.result.pb_sequence);
                            }
                        },
                        function(error) {
                            NotifyService.showPreDialog('Error updating PB Sequence', error);
                        });
                }
            }, function() {
                NotifyService.showSimpleToast('Cancelled PB Order edit for ' + pb.pb_id);
            });
        };

        vm.cloneAndAssignSB = function(item) {
            ObsSchedService.cloneAndAssignSB(item.id_code, item.sub_nr);
        };
        vm.cloneAndScheduleSB = function(item) {
            ObsSchedService.cloneAndScheduleSB(item.id_code, item.sub_nr);
        };

        vm.viewSBTasklog = function(sb, mode) {
            ObsSchedService.viewTaskLogForSBIdCode(sb.id_code, mode);
        };

        vm.showSubarrayLogs = function() {
            ObsSchedService.showSubarrayLogs(vm.subarray.id);
        };

        vm.showResourceLogs = function(resourceName) {
            ObsSchedService.showResourceLogs(resourceName);
        };

        vm.moveScheduleRowToFinished = function(item) {
            ObsSchedService.scheduleToComplete(item.sub_nr, item.id_code);
        };

        vm.moveScheduleRowToApproved = function(item) {
            ObsSchedService.scheduleToApproved(item.sub_nr, item.id_code);
        };

        vm.setSchedulerMode = function(subarrayId, mode) {
            ObsSchedService.setSchedulerModeForSubarray(subarrayId, mode);
        };

        vm.verifySB = function(sb) {
            ObsSchedService.verifyScheduleBlock(sb.sub_nr, sb.id_code);
        };

        vm.setupSubarrayFromPB = function(sub_nr, pb_id, assignOnly, event) {
            ObsSchedService.setupSubarrayFromPB(sub_nr, pb_id, assignOnly, event);
        };

        vm.removeSBFromAnyPB = function(sb) {
            ObsSchedService.updateScheduleBlockWithProgramBlockID(sb, null).then(
                function() {
                    NotifyService.showSimpleToast('Removed SB ' + sb.id_code + ' from PB.');
                },
                function(result) {
                    NotifyService.showSimpleDialog('Error removing SB from PB',
                        'Error while removing Schedule Block (' + sb.id_code + ') from Program Block!');
                });
        };

        vm.deleteProgramBlock = function(pb, orphanSBs) {
            ObsSchedService.deleteProgramBlock(pb, orphanSBs);
        };

        vm.unassignPBFromSubarrays = function(pb) {
            pb.schedule_blocks.forEach(function(sb) {
                if (sb.state === 'APPROVED' && sb.sub_nr) {
                    ObsSchedService.unassignScheduleBlock(sb.sub_nr, sb.id_code);
                }
            });
        };

        vm.hasScheduleBlocks = function(item) {
            return function(item) {
                return angular.isDefined(item.schedule_blocks) && item.schedule_blocks.length > 0;
            };
        };

        vm.classForResource = function(resourceName) {
            var classes = "";
            if (vm.isResourceInMaintenance(resourceName)) {
                classes += 'maintenance-bg-hover';
            }
            if (vm.isResourceFaulty(resourceName)) {
                classes += ' faulty-border';
            }
            var resourceStateSensor = vm.sensorValues[resourceName + '_state'];
            if (resourceStateSensor) {
                if (resourceStateSensor.value === 'activated') {
                    classes += ' resource-state-activated';
                } else if (resourceStateSensor.value === 'error') {
                    classes += ' resource-state-error';
                } else if (vm.resourceBusyStates.indexOf(resourceStateSensor.value) > -1) {
                    classes += ' resource-state-busy';
                }
            }
            return classes;
        };

        vm.initSensors = function() {
            ConfigService.getSystemConfig()
                .then(function(systemConfig) {
                    var subarrayNames = systemConfig.subarrayNrs.map(function(subNr) {
                        return 'subarray_' + subNr;
                    });

                    function handleListSensorsResult(result) {
                        result.data.forEach(function(sensor) {
                            MonitorService.subscribeSensor(sensor);
                            vm.subscribedSensors.push(sensor);
                            vm.sensorUpdateMessage(null, sensor);
                        });
                    }

                    function handleListSensorsError(error) {
                        $log.error(error);
                    }

                    MonitorService.listSensorsHttp(subarrayNames, vm.subarraySensorNames.join('|'), true)
                        .then(function(result) {
                            result.data.forEach(function(sensor) {
                                MonitorService.subscribeSensor(sensor);
                                vm.subscribedSensors.push(sensor);
                                if (sensor.name.endsWith('pool_resources')) {
                                    $timeout(function() {
                                        vm.sensorUpdateMessage(null, sensor);
                                    }, 1000, sensor);
                                } else {
                                    vm.sensorUpdateMessage(null, sensor);
                                }
                            });
                        }, handleListSensorsError);
                    MonitorService.listSensorsHttp('sched', vm.schedSensorNames.join('|'), true)
                        .then(handleListSensorsResult, handleListSensorsError);
                    MonitorService.listSensorsHttp('katpool', vm.katpoolSensorNames.join('|'), true)
                        .then(handleListSensorsResult, handleListSensorsError);
                    // systemConfig['katconn:resources'].single_ctl example: m011,ptuse_N,cbf_N,sdp_N
                    MonitorService.listSensorsHttp(
                            systemConfig['katconn:resources'].single_ctl,
                            '^(' + systemConfig['katconn:resources'].single_ctl.replace(/,/g, '|') + ').state$', true)
                        .then(handleListSensorsResult, handleListSensorsError);

                    vm.sensorsRegex = [
                        vm.subarraySensorNames.join('|'),
                        vm.schedSensorNames.join('|'),
                        vm.katpoolSensorNames.join('|'),
                        'state$'
                    ].join('|');
                });
            MonitorService.subscribe('portal.sched');
            ObsSchedService.guiUrls = {};
        };

        vm.sensorUpdateMessage = function(event, sensor, subject) {
            if (sensor.name.search(vm.sensorsRegex) < 0) {
                return;
            }
            ObsSchedService.sensorValues[sensor.name] = sensor;
            ObsSchedService.receivedResourceMessage(sensor);
            if (vm.subarray && sensor.name === vm.subarray.name + '_state' && sensor.value === 'active') {
                if (!ObsSchedService.sensorValues[vm.subarray.name + '_pool_resources']) {
                    $timeout(function() {
                        vm.updateGuiUrls();
                    }, 3000);
                    return;
                }
                ObsSchedService.guiUrls = {};
                vm.updateGuiUrls();
            }
        };

        vm.updateGuiUrls = function() {
            if (ObsSchedService.sensorValues[vm.subarray.name + '_pool_resources']) {
                var resourceNames = ObsSchedService.sensorValues[vm.subarray.name + '_pool_resources'].value;
                MonitorService.listSensorsHttp(resourceNames, 'gui.urls$', true).then(function(result) {
                    result.data.forEach(function(guiUrlSensor) {
                        ObsSchedService.guiUrlsMessageReceived(guiUrlSensor);
                    });
                    vm.guiUrls = ObsSchedService.guiUrls;
                });
            }
        };

        vm.getResources = function (spec, dry_run_alloc, alloc) {
            resources = [];
            if (spec) {
                if (!spec.indexOf('{') > -1) {
                    resources = spec.split(',')
                }
            }
            if (dry_run_alloc) {
                resources = dry_run_alloc.split(',');
            }
            if (alloc) {
                resources = alloc.split(',');
            }
            return resources;
        }

        vm.addUserLog = function ($event, sb=null) {
            var content = '';
            var end_time = '';
            var allocations = [];
            var assignedResources = [];
            var start_time = $rootScope.utcDateTime;
            if (sb) {
                dryrun_link = ConfigService.GetKATTaskFileServerURL() + "/tailtask/" + sb.id_code + "/dryrun"
                content = "Schedule block: " + sb.id_code + "\n\nDry run link: " + dryrun_link;
                if (sb.actual_start_time) {
                    start_time = sb.actual_start_time.split('.')[0];
                }
                if (sb.actual_end_time) {
                    end_time = sb.actual_end_time.split('.')[0];
                }
                allocations = vm.getResources(sb.antenna_spec, sb.antennas_dry_run_alloc,
                    sb.antennas_alloc).concat(vm.getResources(sb.controlled_resources_spec,
                      sb.controlled_resources_dry_run_alloc, sb.controlled_resources_alloc));
                for (var i = 0; i < allocations.length; i++) {
                    var tag = _.findWhere(UserLogService.tags, {name: allocations[i]})
                    if (tag) {
                        assignedResources.push(tag);
                    }
                }
            }
            else {
                allocations = ObsSchedService.sensorValues[vm.subarray.name + '_allocations'].parsedValue;
                for (var i = 0; i < allocations.length; i++) {
                    var tag = _.findWhere(UserLogService.tags, {name: allocations[i][0]})
                    if (tag) {
                        assignedResources.push(tag);
                    }
                }
            }
            var newUserLog = {
                start_time: start_time,
                end_time: end_time,
                tags: assignedResources,
                user_id: $rootScope.currentUser.id,
                content: content,
                attachments: []
            };
            $rootScope.editUserLog(newUserLog, event);
        };

        var unbindUpdate = $rootScope.$on('sensorUpdateMessage', vm.sensorUpdateMessage);
        var unbindReconnected = $rootScope.$on('websocketReconnected', vm.initSensors);

        $scope.$on('$destroy', function() {
            MonitorService.unsubscribe('portal.sched');
            vm.subscribedSensors.forEach(function(sensor) {
                MonitorService.unsubscribeSensor(sensor);
            });
            unbindUpdate();
            unbindReconnected();
            ObsSchedService.sensorValues = {};

            vm.unbindStateChangeStart();

            if (vm.unbindWatchSubarrays) {
                vm.unbindWatchSubarrays();
            }
            if (vm.waitForSubarrayToExistInterval) {
                $interval.cancel(vm.waitForSubarrayToExistInterval);
            }
        });
    }
})();
