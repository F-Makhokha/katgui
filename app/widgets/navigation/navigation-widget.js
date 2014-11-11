(function () {

    angular.module('katGui.widgets.navigationWidget', ['adf.provider'])
        .config(configureNavigationWidget)
        .controller('NavigationWidgetCtrl', NavigationWidgetCtrl);

    function configureNavigationWidget(dashboardProvider) {
        dashboardProvider
            .widget('NavigationWidget', {
                title: 'Navigation Widget',
                description: 'Container for navigation controls/buttons',
                templateUrl: 'app/widgets/navigation/navigation-widget.html',
                controllerAs: 'vm',
                controller: 'NavigationWidgetCtrl'
            });
    }

    //include rootscope for theming binding
    function NavigationWidgetCtrl($rootScope, $state) {

        var vm = this;

        vm.themePrimaryButtons = $rootScope.themePrimaryButtons;

        vm.stateGo = function (newState) {
            $state.go(newState);
        };
    }
})();
