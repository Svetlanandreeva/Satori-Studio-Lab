(function () {
  const cityInput = document.getElementById('destination');
  const estimate = document.querySelector('[data-route-time]');
  const source = document.querySelector('[data-route-source]');
  const pins = document.querySelectorAll('[data-destination]');
  const calculator = 'https://www.dellin.ru/products/ltl/';
  const normalize = city => city.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const routes = new Map(Array.from(document.querySelectorAll('.delivery-routes [data-city]'), link => [
    normalize(link.dataset.city),
    { url: link.href, time: link.nextElementSibling.textContent }
  ]));

  function updateRoute() {
    const city = normalize(cityInput.value);
    const route = routes.get(city);
    estimate.textContent = route ? route.time : 'Уточняется по адресу и параметрам груза';
    source.href = route ? route.url : calculator;
    source.textContent = route ? 'Проверить маршрут' : 'Открыть калькулятор';
    pins.forEach(pin => {
      pin.setAttribute('aria-pressed', String(normalize(pin.dataset.destination) === city));
    });
  }

  cityInput.addEventListener('input', updateRoute);
  pins.forEach(pin => {
    pin.addEventListener('click', () => {
      cityInput.value = pin.dataset.destination;
      updateRoute();
    });
  });
  updateRoute();
})();
