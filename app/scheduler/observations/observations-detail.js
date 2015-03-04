(function () {

    angular.module('katGui.scheduler')
        .controller('SubArrayObservationsDetail', SubArrayObservationsDetail);

    function SubArrayObservationsDetail(ObservationScheduleService, $timeout, $stateParams, $scope, $rootScope) {

        var vm = this;
        vm.subarray_id = parseInt($stateParams.subarray_id);
        vm.draftListProcessingServerCall = false;
        vm.scheduleListProcessingServerCall = false;
        vm.selectedSchedule = null;
        vm.modeTypes = ['queue', 'manual'];

        vm.scheduleCompletedData = ObservationScheduleService.scheduleCompletedData;
        vm.scheduleData = ObservationScheduleService.scheduleData;
        vm.poolResources = ObservationScheduleService.poolResources;
        vm.allocations = ObservationScheduleService.allocations;
        vm.schedulerModes = ObservationScheduleService.schedulerModes;

        vm.completedOrderByFields = [
            {label: 'ID', value: 'id_code'},
            {label: 'Description', value: 'description'},
            {label: 'Date', value: 'desired_start_time'},
            {label: 'State', value: 'state'},
            {label: 'Type', value: 'type'}
        ];

        vm.refreshScheduleBlocks = function () {
            ObservationScheduleService.getScheduleBlocks()
                .then(ObservationScheduleService.getScheduleBlocksFinished)
                .then(ObservationScheduleService.listPoolResources)
                .then(function () {
                    ObservationScheduleService.listAllocationsForSubarray(vm.subarray_id)
                        .then(function() {
                            ObservationScheduleService.getSchedulerModeForSubarray(vm.subarray_id)
                                .then(function() {
                                    vm.selectedMode = ObservationScheduleService.schedulerModes[vm.subarray_id].stringValue;
                                });
                        });
                });
        };

        vm.executeSchedule = function (item) {
            ObservationScheduleService.executeSchedule(vm.subarray_id, item.id_code)
                .then($rootScope.displayPromiseResult);
        };

        vm.stopExecuteSchedule = function (item) {
            ObservationScheduleService.cancelExecuteSchedule(vm.subarray_id, item.id_code)
                .then($rootScope.displayPromiseResult);
        };

        vm.cloneSchedule = function (item) {
            ObservationScheduleService.cloneSchedule(item.id_code)
                .then($rootScope.displayPromiseResult);
        };

        vm.moveScheduleRowToFinished = function (item) {
            vm.selectedSchedule = null;
            ObservationScheduleService.scheduleToComplete(vm.subarray_id, item.id_code)
                .then($rootScope.displayPromiseResult);
        };

        vm.moveScheduleRowToDraft = function (item) {
            vm.selectedSchedule = null;
            ObservationScheduleService.scheduleToDraft(vm.subarray_id, item.id_code)
                .then($rootScope.displayPromiseResult);
        };

        vm.setCompletedOrderBy = function (column, reverse) {
            var newOrderBy = _.findWhere(vm.completedOrderByFields, {value: column});
            if (newOrderBy.reverse === undefined) {
                newOrderBy.reverse = reverse || false;
            } else {
                newOrderBy.reverse = !newOrderBy.reverse;
            }
            vm.completedOrderBy = newOrderBy;
        };

        vm.setCompletedOrderBy('id_code', true);

        vm.setSelectedSchedule = function (selectedSchedule, dontDeselectOnSame) {
            if (vm.selectedSchedule === selectedSchedule && !dontDeselectOnSame) {
                vm.selectedSchedule = null;
            } else {
                vm.selectedSchedule = selectedSchedule;
            }
        };

        vm.markResourceFaulty = function (resource) {
            ObservationScheduleService.markResourceFaulty(resource.name, resource.state === 'faulty' ? 0 : 1)
                .then($rootScope.displayPromiseResult);
        };

        vm.showScheduleBlockDetails = function (sb) {
            //showSimpleDialog('Schedule Block Details', JSON.stringify(sb, null, 4));
            alert(JSON.stringify(sb, null, 4));
        };

        vm.schedulerModeChanged = function () {
            ObservationScheduleService.setSchedulerModeForSubarray(vm.subarray_id, vm.selectedMode)
                .then($rootScope.displayPromiseResult);
        };

        var unbindShortcuts = $rootScope.$on("keydown", function (e, key) {

            if (key === 40) {
                //down arrow
                var index = vm.currentScheduleData.indexOf(vm.selectedSchedule);
                if (index > -1 && index + 1 < vm.currentScheduleData.length) {
                    vm.setSelectedSchedule(vm.currentScheduleData[index + 1]);
                } else if (vm.currentScheduleData.length > 0) {
                    vm.setSelectedSchedule(vm.currentScheduleData[0]);
                }

            } else if (key === 38) {
                //up arrow
                var indexUp = vm.currentScheduleData.indexOf(vm.selectedSchedule);
                if (indexUp > -1 && indexUp - 1 > -1) {
                    //filteredDraftItems
                    vm.setSelectedSchedule(vm.currentScheduleData[indexUp - 1]);
                } else if (vm.currentScheduleData.length > 0) {
                    vm.setSelectedSchedule(vm.currentScheduleData[vm.currentScheduleData.length - 1]);
                }
            } else if (key === 27) {
                //escape
                vm.selectedSchedule = null;
            }

            if (!$scope.$$phase) {
                $scope.$digest();
            }
        });

        $scope.$on('$destroy', function () {
            unbindShortcuts('keydown');
        });

        $timeout(vm.refreshScheduleBlocks, 100);
    }

})();