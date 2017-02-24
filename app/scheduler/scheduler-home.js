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

    function SchedulerHomeCtrl($state, $rootScope, $scope, $interval, $log, SensorsService, ObsSchedService, $timeout, KatGuiUtil,
        UserLogService, NotifyService, MonitorService, ConfigService, $stateParams, $q, $mdDialog, UserService) {

        var vm = this;
        vm.childStateShowing = $state.current.name !== 'scheduler';
        vm.subarrays = ObsSchedService.subarrays;
        vm.programBlocks = ObsSchedService.programBlocks;
        vm.disconnectIssued = false;
        vm.connectInterval = null;
        vm.connectionLost = false;
        vm.subarray = null;
        vm.products = [];
        vm.bands = [];
        vm.users = [];
        vm.iAmCA = false;

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

        $rootScope.getSystemConfig()
            .then(function(systemConfig) {
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
                var productKeys = Object.keys(productConfig);
                productKeys.forEach(function(product) {
                    vm.products.push({
                        name: product,
                        sp_product: productConfig[product].sp_product,
                        cbf_product: productConfig[product].cbf_product
                    });
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
            }
        });

        vm.currentState = function() {
            return $state.current.name;
        };

        MonitorService.subscribe('sched');
        ObsSchedService.getProgramBlocks();
        ObsSchedService.getScheduleBlocks();
        ObsSchedService.getProgramBlocksObservationSchedule();

        vm.checkCASubarrays = function() {
            vm.subarray = _.findWhere(ObsSchedService.subarrays, {
                id: $stateParams.subarray_id
            });
            if (vm.subarray) {
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
            ObsSchedService.setProduct(vm.subarray.id, product);
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
            ObsSchedService.setSubarrayMaintenance(vm.subarray.id, vm.subarray.maintenance ? 'clear' : 'set');
        };

        vm.markResourceFaulty = function(resource) {
            ObsSchedService.markResourceFaulty(resource.name, resource.faulty ? 'clear' : 'set');
        };

        vm.markResourceInMaintenance = function(resource) {
            ObsSchedService.markResourceInMaintenance(resource.name, resource.maintenance ? 'clear' : 'set');
        };

        vm.isResourceInMaintenance = function(resource) {
            if (ObsSchedService.resources_in_maintenance) {
                resource.maintenance = ObsSchedService.resources_in_maintenance.indexOf(resource.name) !== -1;
                return resource.maintenance;
            } else {
                resource.maintenance = false;
                return false;
            }
        };

        vm.isResourceFaulty = function(resource) {
            resource.faulty = ObsSchedService.resources_faulty.indexOf(resource.name) !== -1;
            return resource.faulty;
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

        vm.listResourceMaintenanceDevicesDialog = function(resource, $event) {
            ObsSchedService.listResourceMaintenanceDevicesDialog(vm.subarray.id, resource.name, $event);
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
            ObsSchedService.cancelExecuteSchedule(item.sub_nr, item.id_code);
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
            var confirm = $mdDialog.prompt()
                .title('Set Lead Operator Priority for ' + sb.id_code)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('Lead Operator Priority')
                .ariaLabel('Lead Operator Priority')
                .initialValue(sb.lead_operator_priority)
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
            var confirm = $mdDialog.prompt()
                .title('Set SB Order for ' + sb.id_code)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('SB Order')
                .ariaLabel('SB Order')
                .initialValue(sb.sb_order)
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
            var confirm = $mdDialog.prompt()
                .title('Set SB Sequence for ' + sb.id_code)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('SB Sequence')
                .ariaLabel('SB Sequence')
                .initialValue(sb.sb_sequence)
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
            var confirm = $mdDialog.prompt()
                .title('Set Director Priority for ' + pb.pb_id)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('Director Priority')
                .ariaLabel('Director Priority')
                .initialValue(pb.director_priority)
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
            var confirm = $mdDialog.prompt()
                .title('Set PB Order for ' + pb.pb_id)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('PB Order')
                .ariaLabel('PB Order')
                .initialValue(pb.pb_order)
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
            var confirm = $mdDialog.prompt()
                .title('Set PB Sequence for ' + pb.pb_id)
                .textContent('Must be an number between 0 and 100 ("none" or empty to clear)')
                .placeholder('PB Sequence')
                .ariaLabel('PB Sequence')
                .initialValue(pb.pb_sequence)
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

        vm.showSubarrayAndDataLogs = function() {
            ObsSchedService.showSubarrayAndDataLogs(vm.subarray.id);
        };

        vm.moveScheduleRowToFinished = function(item) {
            ObsSchedService.scheduleToComplete(item.sub_nr, item.id_code);
        };

        vm.moveScheduleRowToApproved = function(item) {
            ObsSchedService.scheduleToApproved(item.sub_nr, item.id_code);
        };

        vm.setSchedulerMode = function(mode) {
            ObsSchedService.setSchedulerModeForSubarray(vm.subarray.id, mode);
        };

        vm.verifySB = function(sb) {
            ObsSchedService.verifyScheduleBlock(sb.sub_nr, sb.id_code);
        };

        vm.setupSubarrayFromPB = function(sub_nr, pb_id, event) {
            ObsSchedService.setupSubarrayFromPB(sub_nr, pb_id, event);
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

        vm.hasScheduleBlocks = function(item) {
            return function(item) {
                return angular.isDefined(item.schedule_blocks) && item.schedule_blocks.length > 0;
            };
        };

        $scope.$on('$destroy', function() {
            MonitorService.unsubscribe('sched', '*');
            vm.unbindStateChangeStart();

            if (vm.connectInterval) {
                $interval.cancel(vm.connectInterval);
            }
            if (vm.unbindWatchSubarrays) {
                vm.unbindWatchSubarrays();
            }
            if (vm.waitForSubarrayToExistInterval) {
                $interval.cancel(vm.waitForSubarrayToExistInterval);
            }
            SensorsService.disconnectListener();
            vm.disconnectIssued = true;
        });
    }
})();
