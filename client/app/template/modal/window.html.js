angular.module("template/modal/window.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/modal/window.html",
    "<div class=\"modal fade\" ng-class=\"{in: animate}\" ng-transclude></div>");
}]);
