angular.module('katGui.alarms')

    .controller('AlarmsNotifyCtrl', function ($rootScope, $scope, $timeout) {

        $scope.largeAlarms = true;
        $scope.messages = [];

        $scope.addAlarmMessage = function (message) {
            $scope.messages.push(message);

            if (message.severity === 'unknown' ||
                message.severity === 'nominal' ||
                message.severity === 'maintenance') {
                message.ttl = 10000;
            }

            if (message.ttl && message.ttl !== -1) {
                $timeout(function () {
                    $scope.deleteMessage(message);
                }, message.ttl);
            }
        };

        $rootScope.$on('alarmMessage', function (event, message) {
            $scope.addAlarmMessage(message);

            if (message.priority === 'new') {

                if (message.severity === 'warn') {
                    $rootScope.newAlarmWarnCount++;
                } else if (message.severity === 'error') {
                    $rootScope.newAlarmErrorCount++;
                } else if (message.severity === 'critical') {
                    $rootScope.newAlarmCritCount++;
                }
            }
        });

        $scope.acknowledgeMessage = function (message) {
            $scope.deleteMessage(message);
        };

        $scope.deleteMessage = function (message) {
            var index = $scope.messages.indexOf(message);
            if (index > -1) {
                $scope.messages.splice(index, 1);
            }
        };

        $scope.computeSeverityClasses = function (message) {
            return {
                'alarm-critical': message.severity === 'critical',
                'alarm-error': message.severity === 'error',
                'alarm-warning': message.severity === 'warn',
                'alarm-maintenance': message.severity === 'maintenance',
                'alarm-info': message.severity === 'info',
                'alarm-nominal': message.severity === 'nominal',
                'alarm-unknown': message.severity === 'unknown'
            };
        };

        $scope.getActiveClass = function () {
            return $scope.largeAlarms ? 'large-alarm' : 'small-alarm';
        };
    })

    .directive('alarm', function () {
        return {
            restrict: 'A',
            template: '<div ng-class="getActiveClass()">' +
                '   <div class="alarm-item" ng-repeat="message in messages" ng-if="message.priority === \'new\'" ng-class="computeSeverityClasses(message)">' +
                '       <div>' +
                '           <ul>' +
                '               <li class=""><button class="alarm-close" ng-click="acknowledgeMessage(message)">Acknowledge</button></li>' +
                '               <li class=""><button class="alarm-close" ng-click="deleteMessage(message)">Known</button></li>' +
                '           </ul>' +
                '       </div>' +
                '       <span class="datestamp">{{message.date}}</span>' +
                '       <div class="severitystamp">{{message.severity}}</div>' +
                '       <div><h3>{{message.name}}</h3><br/>' +
                '       <span>{{message.message}}</span>' +
                '       </div>' +
                '   </div>' +
                '</div>',
            replace: false,
            scope: true,
            controller: 'AlarmsNotifyCtrl'
        };
    });