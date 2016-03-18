(function () {

    angular.module('katGui')
        .controller('UserlogReportsCtrl', UserlogReportsCtrl);

        function UserlogReportsCtrl($rootScope, $scope, $localStorage, $filter, UserLogService,
                                    $log, $stateParams, NotifyService, $timeout, $state) {

            var vm = this;
            vm.startTime = moment.utc().format('YYYY-MM-DD 00:00:00');
            vm.endTime = moment.utc().format('YYYY-MM-DD 23:59:59');
            vm.tags = UserLogService.tags;
            vm.filterTags = [];
            vm.reportUserlogs = [];
            var startTimeParam = $stateParams.startTime;
            var endTimeParam = $stateParams.endTime;

            if ($stateParams.filter) {
                vm.searchInputText = $stateParams.filter;
            }

            vm.userLogsFields = [
                {label: 'Start Time', value: 'start_time'},
                {label: 'Name', value: 'user.name'},
                {label: 'End Time', value: 'end_time'},
                {label: 'Content', value: 'content'}
            ];

            vm.querySearch = function (query) {
                var results = query ? vm.tags.filter(vm.createFilterFor(query)) : [];
                return results;
            };

            vm.createFilterFor = function (query) {
                return function filterFn(tag) {
                    return (tag.name.toLowerCase().indexOf(query.toLowerCase()) === 0 && tag.activated);
                };
            };

            vm.editUserLog = function (userlog, event) {
                UserLogService.editUserLog(userlog, false, event);
            };

            vm.exportPdf = function(){
                vm.exportingPdf = true;
                var pdf = new jsPDF('l', 'pt');
                var exportTime = moment.utc().format('YYYY-MM-DD HH:mm:ss');
                var query = "?start_time=" + vm.startTime + "&end_time=" + vm.endTime;

                vm.filteredReportUserlogs.forEach(function (userlog) {
                    userlog.userName = userlog.user.name;
                    var tagNames = [];
                    userlog.tags.forEach(function (tag) {
                        tagNames.push(tag.name);
                    });
                    userlog.tag_list = tagNames.join(',');
                });

                var columns = [
                    {title: "User", dataKey: "userName"},
                    {title: "Start", dataKey: "start_time"},
                    {title: "End", dataKey: "end_time"},
                    {title: "Content", dataKey: "content"},
                    {title: "Tags", dataKey: "tag_list"}
                ];

                pdf.setFontSize(20);
                pdf.text('Userlog Report - ' + exportTime + ' (UTC)', 20, 25);
                pdf.setFontSize(12);
                pdf.setFontSize(12);
                pdf.text(('From: ' + vm.startTime + '     To: ' + vm.endTime), 20, 45);

                pdf.autoTable(columns, vm.filteredReportUserlogs, {
                    startY: 55,
                    theme: 'striped',
                    margin: {top: 8, bottom: 8},
                    columnStyles: {
                        userName: {columnWidth: 80, overflow: 'linebreak'},
                        start_time: {columnWidth: 120},
                        end_time: {columnWidth: 120},
                        content: {overflow: 'linebreak'},
                        tag_list: {overflow: 'linebreak'}}});

                if (vm.includeActivityLogs) {
                    columns = [{title: "System Activity Logs", key: "msg"}];

                    UserLogService.queryActivityLogs(query).then(
                        function (result) {
                            pdf.autoTable(columns, result.data, {
                                startY: pdf.autoTableEndPosY() + 50,
                                theme: 'striped',
                                margin: {top: 8, bottom: 8}});
                            pdf.save('Userlog_Report_' + exportTime.replace(/ /g, '.') + '.pdf');
                            vm.exportingPdf = false;
                        }, function (error) {
                            $log.error(error);
                            vm.exportingPdf = false;
                        });
                } else {
                    pdf.save('Userlog_Report_' + exportTime.replace(/ /g, '.') + '.pdf');
                    vm.exportingPdf = false;
                }
            };

            vm.queryUserlogs = function () {
                var filterTagsList = vm.filterTags.map(function (tag) {
                    return tag.id;
                }).join(',');
                $state.go('userlog-reports', {
                        startTime: vm.startTime,
                        endTime: vm.endTime,
                        tagIds: filterTagsList? filterTagsList : ',',
                        filter: vm.searchInputText},
                        { notify: false, reload: false });
                vm.reportUserlogs = [];
                var query = "?";
                query += "start_time=" + vm.startTime + "&";
                query += "end_time=" +  vm.endTime;
                UserLogService.queryUserLogs(query).then(function (result) {
                    if (result.data) {
                        result.data.forEach(function (userlog) {
                            vm.reportUserlogs.push(UserLogService.populateUserlogTagsFromMap(userlog));
                        });
                    }
                });
            };

            vm.filterByTag = function (userlog) {
                if (vm.filterTags.length === 0) {
                    return true;
                }
                var matchCount = 0;
                for (var i = 0; i < userlog.tags.length; i++) {
                    if (_.findIndex(vm.filterTags, {name: userlog.tags[i].name}) > -1) {
                        matchCount++;
                    }
                }
                return matchCount > 0 && matchCount === vm.filterTags.length;
            };

            vm.afterInit = function() {
                UserLogService.listTags().then(function () {
                    if ($stateParams.tagIds) {
                        var tagIdsList = $stateParams.tagIds.split(',');
                        vm.filterTags = UserLogService.tags.filter(function (tag) {
                            return tagIdsList.indexOf(tag.id.toString()) > -1;
                        });
                    }
                });
                $timeout(function () {
                    if (moment.utc($stateParams.startTime, 'YYYY-MM-DD HH:mm:ss', true).isValid() &&
                        moment.utc($stateParams.endTime, 'YYYY-MM-DD HH:mm:ss', true).isValid()) {
                        vm.startTime = $stateParams.startTime;
                        vm.endTime = $stateParams.endTime;
                        var query = "?";
                        query += "start_time=" + vm.startTime + "&";
                        query += "end_time=" +  vm.endTime;
                        UserLogService.queryUserLogs(query).then(function (result) {
                            if (result.data) {
                                result.data.forEach(function (userlog) {
                                    vm.reportUserlogs.push(UserLogService.populateUserlogTagsFromMap(userlog));
                                });
                            }
                        });
                    } else if ($stateParams.startTime && $stateParams.endTime) {
                        NotifyService.showSimpleDialog('Invalid Datetime URL Parameters',
                            'Invalid datetime strings: ' + $stateParams.startTime + ' or ' + $stateParams.endTime + '. Format should be YYYY-MM-DD HH:mm:ss.');
                    }
                }, 1000);
            };

            if ($rootScope.currentUser) {
                vm.afterInit();
            } else {
                vm.unbindLoginSuccess = $rootScope.$on('loginSuccess', vm.afterInit);
            }

            $scope.$on('$destroy', function () {
                if (vm.unbindLoginSuccess) {
                    vm.unbindLoginSuccess();
                }
            });
        }
})();
