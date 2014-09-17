describe('Directive: alarms notify', function () {

    beforeEach(module('katGui.alarms'));
    beforeEach(module('templates'));

    var scope, compile, alarmsService, element;

    beforeEach(inject(function ($rootScope, $compile, alarms) {
        scope = $rootScope.$new();
        compile = $compile;
        alarmsService = alarms;

        var strAlarmsNotify = '<div alarm></div>';
        element = compile(strAlarmsNotify)(scope);
        scope.$digest();
    }));


//    [{"date": 1410948999.507357, "priority": "new", "message": "wnaneahkgxravrngkqgh", "severity": "unknown", "name": "awesome_alien"}, {"date": 1410948999.507401, "priority": "acknowledged", "message": "kinrumysllcrszkbcdgg", "severity": "warn", "name": "hail"}, {"date": 1410948999.507425, "priority": "known", "message": "detijtxvwjszrebadfma", "severity": "critical", "name": "snow"}, {"date": 1410948999.507448, "priority": "new", "message": "lvawqcajuvvlgujcxvcl", "severity": "warn", "name": "tiny_alien"}, {"date": 1410948999.507472, "priority": "acknowledged", "message": "kfflclqzgiotbunwtpef", "severity": "unknown", "name": "snow"}, {"date": 1410948999.507494, "priority": "acknowledged", "message": "kizavsyhcgjiuleljitl", "severity": "nominal", "name": "snow"}, {"date": 1410948999.507517, "priority": "new", "message": "zcpdnuhrhztypuklbpak", "severity": "nominal", "name": "tiny_alien"}, {"date": 1410948999.507539, "priority": "known", "message": "nbkjnrkeoogsuzvamjwg", "severity": "warn", "name": "rust"}, {"date": 1410948999.507561, "priority": "known", "message": "cmgpdfvsllitvsxnyjnk", "severity": "error", "name": "humidity"}, {"date": 1410948999.507583, "priority": "cleared", "message": "cdzjrvqjwjpnftbugois", "severity": "critical", "name": "snow"}]

    it ('should display alarm when alarm is received and priority is new', function () {

        var alarmObj = {"date": 1410948999.507357, "priority": "new", "message": "alarm message", "severity": "critical", "name": "alarm name"};
        alarmsService.addAlarmMessage(alarmObj);
        scope.$digest();

        expect(element.scope().messages[0]).toBe(alarmObj);
        expect(element.text()).toContain("alarm message");
        expect(element.text()).toContain("critical");
        expect(element.text()).toContain("alarm name");
    });

    it ('should NOT display alarm when alarm is received and priority is NOT new', function () {

        var alarmObj2 = {"date": 1410948999.507357, "priority": "known", "message": "alarm message2", "severity": "critical", "name": "alarm name2"};
        alarmsService.addAlarmMessage(alarmObj2);
        scope.$digest();

        expect(element.scope().messages[0]).toBe(alarmObj2);
        expect(element.text()).not.toContain("alarm message2");
        expect(element.text()).not.toContain("alarm name2");
    });

});