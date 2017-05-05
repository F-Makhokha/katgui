(function() {

    angular.module('katGui.health')
        .controller('ConfigHealthPenViewCtrl', ConfigHealthPenViewCtrl);

    function ConfigHealthPenViewCtrl($scope, $sce, $timeout, $rootScope, $log, ConfigService, SensorsService, NotifyService, $interval, StatusService) {

        var vm = this;
        vm.configPenKeys = [];
        vm.configPens = {};
        vm.trustedContent = null;
        vm.allowedElements = ['rect', 'path', 'ellipse'];

        ConfigService.getConfigHealthPens().then(function() {
            vm.configPens = ConfigService.configPens;
            vm.configPenKeys = Object.keys(vm.configPens);
        });

        vm.compileSvgContents = function(file) {
            SensorsService.disconnectListener();
            var svgContent = $sce.trustAsHtml(vm.configPens[file]);
            vm.trustedContent = svgContent;
            vm.connectListeners();
        };

        vm.connectListeners = function() {
            SensorsService.connectListener()
                .then(function() {
                    vm.initSensors();
                    if (vm.connectInterval) {
                        $interval.cancel(vm.connectInterval);
                        vm.connectInterval = null;
                        NotifyService.showSimpleToast('Reconnected :)');
                    }
                }, function() {
                    $log.error('Could not establish sensor connection. Retrying every 10 seconds.');
                    if (!vm.connectInterval) {
                        vm.connectInterval = $interval(vm.connectListeners, 10000);
                    }
                });
            vm.handleSocketTimeout();
        };

        vm.handleSocketTimeout = function() {
            SensorsService.getTimeoutPromise()
                .then(function() {
                    NotifyService.showSimpleToast('Connection timeout! Attempting to reconnect...');
                    if (!vm.connectInterval) {
                        vm.connectInterval = $interval(vm.connectListeners, 10000);
                        vm.connectListeners();
                    }
                });
        };

        vm.initSensors = function() {
            // give time for digests and dom creation
            $timeout(function() {
                var potentialSensors = [];
                vm.allowedElements.forEach(function(elementType) {
                    var items = d3.selectAll(elementType);
                    items[0].forEach(function(item) {
                        // add the id as a class to the element for updates
                        d3.select(item).classed(item.id, true);
                        potentialSensors.push(item.id);
                    });
                });
                SensorsService.setSensorStrategies(potentialSensors.join('|'), 'event-rate', 1, 360);
            });
        };

        vm.pendingUpdatesInterval = $interval(StatusService.applyPendingUpdates, 300);

        var unbindUpdate = $rootScope.$on('sensorsServerUpdateMessage', function(event, sensor) {
            var sensorName = sensor.name.split(':')[1];
            sensor.status = sensor.value.status;
            sensor.received_timestamp = sensor.value.received_timestamp;
            sensor.timestamp = sensor.value.timestamp;
            sensor.value = sensor.value.value;
            d3.select('.' + sensorName)
                .attr('class', '')
                .classed(sensorName, true)
                .classed(sensor.status + '-child', true);
        });

        $scope.$on('$destroy', function() {
            // $interval.cancel(vm.pendingUpdatesInterval);
            unbindUpdate();
            SensorsService.disconnectListener();
            StatusService.sensorValues = {};
        });
    }
})();
