(function () {

    angular.module('katGui.services')
        .service('ConfigService', ConfigService);

    function ConfigService($q, $http, SERVER_URL, $rootScope, $timeout) {

        var urlBase = SERVER_URL + ':8840';
        var api = {};
        api.receptorStatusTree = {};
        api.receptorList = [];

        api.getStatusTreeForReceptor = function () {
            return $http(createRequest('get', urlBase + '/statustrees/receptors_view/receptors'));
        };

        api.getStatusTreesForTop = function () {
            return $http(createRequest('get', urlBase + '/statustrees/top_view'));
        };

        api.getReceptorList = function () {
            api.receptorList.splice(0, api.receptorList.length);

            var deferred = $q.defer();
            $http(createRequest('get', urlBase + '/installed-config/receptors'))
                .success(function (result) {
                    result.forEach(function (item) {
                        api.receptorList.push(item);
                    });
                    deferred.resolve(api.receptorList);
                })
                .error(function (result) {
                    console.error(result);
                    deferred.reject();
                });

            return deferred.promise;
        };

        api.getSiteLocation = function () {
          return $http(createRequest('get', urlBase + '/array/position'));
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