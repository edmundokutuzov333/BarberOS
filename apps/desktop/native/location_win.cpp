#include "location.h"
#include <windows.h>
#include <roapi.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Devices.Geolocation.h>
#include <chrono>
using namespace winrt::Windows::Devices::Geolocation;
static winrt::fire_and_forget Locate(std::shared_ptr<LocationRequest> request) {
  try {
    // Called by Electron's foreground UI thread, as required by RequestAccessAsync.
    Geolocator locator;
    locator.DesiredAccuracy(PositionAccuracy::Default);
    auto access = co_await Geolocator::RequestAccessAsync();
    if (request->finished.load()) co_return;
    if (access != GeolocationAccessStatus::Allowed) { LocationResult error; error.code = 1; FinishLocation(request, error); co_return; }
    auto position = co_await locator.GetGeopositionAsync(std::chrono::minutes(5), std::chrono::seconds(15));
    if (request->finished.load()) co_return;
    auto coordinate = position.Coordinate();
    auto point = coordinate.Point().Position();
    LocationResult value; value.ok = true; value.latitude = point.Latitude; value.longitude = point.Longitude;
    value.accuracy = coordinate.Accuracy();
    value.timestamp = static_cast<double>(std::chrono::duration_cast<std::chrono::milliseconds>(coordinate.Timestamp().time_since_epoch()).count() - 11644473600000LL);
    FinishLocation(request, value);
  } catch (const winrt::hresult_error& error) {
    LocationResult value;
    if (error.code() == E_ACCESSDENIED) value.code = 1;
    else if (error.code() == HRESULT_FROM_WIN32(ERROR_TIMEOUT)) value.code = 3;
    FinishLocation(request, value);
  } catch (...) { FinishLocation(request, LocationResult{}); }
}
static napi_value RequestLocation(napi_env env, napi_callback_info) {
  napi_value promise;
  auto request = NewLocationRequest(env, &promise);
  if (!request) { napi_throw_error(env, nullptr, "Unable to create location request"); return nullptr; }
  try {
    APTTYPE type; APTTYPEQUALIFIER qualifier;
    if (CoGetApartmentType(&type, &qualifier) == CO_E_NOTINITIALIZED) winrt::init_apartment(winrt::apartment_type::single_threaded);
    Locate(request);
  } catch (...) { FinishLocation(request, LocationResult{}); }
  return promise;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_value method;
  napi_create_function(env, "requestLocation", NAPI_AUTO_LENGTH, RequestLocation, nullptr, &method);
  napi_set_named_property(env, exports, "requestLocation", method);
  napi_add_env_cleanup_hook(env, CancelLocationRequests, nullptr);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
