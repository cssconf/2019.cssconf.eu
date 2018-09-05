'use strict';

;(function () {
  const toggle = document.querySelectorAll('.js-nav-main-toggle');

  toggle.forEach(function (el) {
    el.addEventListener('click', function () {
      document.querySelector('body').classList.toggle('is-nav-opened');
    });
  });
})();
