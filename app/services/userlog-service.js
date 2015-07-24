(function () {

    angular.module('katGui.services')
        .service('UserLogService', UserLogService);

    function UserLogService($http, $q, SERVER_URL, $rootScope, $window, $log) {

        var api = {};
        api.urlBase = SERVER_URL + '/katcontrol/api/v1';
        api.userlogs = [];
        api.my_userlogs = [];
        api.report_userlogs = [];
        api.focus_ulog = {};
        api.tags = [];
        api.taxonomies = [];
        api.file_url = "";

        api.getUserLog = function (ulog_id) {

            var def = $q.defer();

            $http(createRequest('get', api.urlBase + '/logs/' + ulog_id)).then(
                function (result) {

                    if (result && result.data) {
                        api.focus_ulog = result.data;
                        def.resolve();
                    } else {
                        $log.error('Could not retrieve requested userlog.');
                        def.reject();
                    }
                });

            return def.promise;
        };


        api.listUserLogs = function () {

            var def = $q.defer();

            $http(createRequest('get', api.urlBase + '/logs')).then(
                function (result) {

                    if (result && result.data) {
                        api.userlogs.splice(0, api.userlogs.length);
                        result.data.forEach(function (userlog) {
                            api.userlogs.push(userlog);
                        });
                        def.resolve();
                    } else {
                        $log.error('Could not retrieve any users.');
                        def.reject();
                    }
                });

            return def.promise;
        };


        api.listMyUserLogs = function (user) {
            var defer = $q.defer();
            $http(createRequest('get', api.urlBase + '/logs/query?user=' + user))
                .success(function (result) {
                    api.my_userlogs.splice(0, api.my_userlogs.length);
                    result.forEach(function (userlog) {
                        api.my_userlogs.push(userlog);
                    });
                    defer.resolve();
                })
                .error(function (result) {
                    $rootScope.showSimpleDialog("Could not retrieve any userlogs", result);
                    defer.reject();
                });
            return defer.promise;
        };


        api.listTags = function () {

            var def = $q.defer();

            $http(createRequest('get', api.urlBase + '/tags')).then(
                function (result) {

                    if (result && result.data) {
                        api.tags.splice(0, api.tags.length);
                        result.data.forEach(function (tag) {
                            api.tags.push(tag);
                        });
                        def.resolve();
                    } else {
                        $log.error('Could not retrieve any tags.');
                        def.reject();
                    }
                });

            return def.promise;
        };


        api.listTaxonomies = function () {

            var def = $q.defer();

            $http(createRequest('get', api.urlBase + '/taxonomies')).then(
                function (result) {

                    if (result && result.data) {
                        api.taxonomies.splice(0, api.taxonomies.length);
                        result.data.forEach(function (taxonomy) {
                            api.taxonomies.push(taxonomy);
                        });
                        def.resolve();
                    } else {
                        $log.error('Could not retrieve any taxonomies.');
                        def.reject();
                    }
                });

            return def.promise;
        };


        api.queryUserLogs = function (query) {
            var query_uri = encodeURI(query);
            $log.info("Query uri: " + query_uri);
            var defer = $q.defer();
            $http(createRequest('get', api.urlBase + '/logs/query' + query_uri))
                .success(function (result) {
                    api.report_userlogs.splice(0, api.report_userlogs.length);
                    result.forEach(function (userlog) {
                        api.report_userlogs.push(userlog);
                    });
                    defer.resolve();
                })
                .error(function (result) {
                    $rootScope.showSimpleDialog("Could not retrieve any userlogs", result);
                    defer.reject();
                });
            return defer.promise;
        };


        api.uploadFileToUrl = function(file, ulog_id){
            var fd = new FormData();
            for (var i = 0; i < file.length; i++) {
                fd.append('filedata[]', file[i]);
            }
            $http.post(api.urlBase + '/logs/' + ulog_id + '/attachments', fd, {
                transformRequest: angular.identity,
                headers: {'Content-Type': undefined,
                          'Authorization': 'CustomJWT ' + $rootScope.jwt}
            })
            .success(function(){
                $log.info("Attachments uploaded!");
            })
            .error(function(){
                $log.error(api.urlBase + '/log/attach/' + ulog_id);
            });
        };


        api.getFileFromUrl = function(file_name, file_alias, ulog_id) {
            $http.get(api.urlBase + '/logs/' + ulog_id + '/attachments/' + file_name, {
                headers: {'Content-Type': 'application/json',
                          'Authorization': 'CustomJWT ' + $rootScope.jwt
                },
                responseType:'blob'
            })
            .success(function(result){
                var blob = result;
                var url = $window.URL || $window.webkitURL;
                var file_url = url.createObjectURL(blob);
                var downloadLink = angular.element('<a></a>');
                downloadLink.attr('href',file_url);
                downloadLink.attr('download', file_alias);
                downloadLink[0].click();
                url.revokeObjectURL(file_url);
            })
            .error(function(){
                $log.error(api.urlBase + '/logs/get/attach');
            });
        };


        api.addUserLog = function (ulog) {

            var defer = $q.defer();
            $http(createRequest('post',
                api.urlBase + '/logs',
                {
                    user: ulog.user,
                    log_type: ulog.userlog_type,
                    start_time: ulog.start_time,
                    end_time: ulog.end_time,
                    content: ulog.userlog_content,
                    tags: ulog.tags
                }))
                .success(function (result) {
                    ulog.id = result.id
                    $rootScope.showSimpleToast("New " + result.userlog_type + " added! ");
                    defer.resolve();
                })
                .error(function (result) {
                    $rootScope.showSimpleDialog("Error creating userlog", result);
                    defer.reject();
                });
            return defer.promise;
        };

        api.modifyUserLog = function (ulog) {

            var defer = $q.defer();
            $http(createRequest('put',
                api.urlBase + '/logs/' + ulog.id,
                {
                    log_type: ulog.userlog_type,
                    start_time: ulog.start_time,
                    end_time: ulog.end_time,
                    content: ulog.userlog_content,
                    tags: ulog.tags
                }))
                .success(function (result) {
                    ulog.id = result.id
                    $rootScope.showSimpleToast("Edited userlog " + result.id);
                    defer.resolve();
                })
                .error(function (result) {
                    $rootScope.showSimpleDialog("Error creating userlog", result);
                    defer.reject();
                });
            return defer.promise;
        };

        function createRequest(method, url, data) {
            var req = {
                method: method,
                url: url,
                headers: {
                    'Authorization': 'CustomJWT ' + $rootScope.jwt
                }
            };

            if ((data && method === 'post') || (data && method === 'put')) {
                req.headers['Content-Type'] = 'application/json';
                req.data = data;
            }

            return req;
        }

        return api;
    }

})();
