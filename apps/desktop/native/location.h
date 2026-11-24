#pragma once
#include <node_api.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <cmath>

struct LocationResult {
  bool ok = false;
  int code = 2;
  double latitude = 0, longitude = 0, accuracy = 0, timestamp = 0;
};
struct LocationRequest {
  napi_threadsafe_function function = nullptr;
  std::atomic<bool> finished{false};
};
static std::mutex requestsMutex;
static std::unordered_map<LocationRequest*, std::shared_ptr<LocationRequest>> requests;

static void DeliverLocation(napi_env env, napi_value, void* context, void* data) {
  std::unique_ptr<LocationResult> result(static_cast<LocationResult*>(data));
  if (!env) return;
  napi_value value, field;
  napi_create_object(env, &value);
  napi_get_boolean(env, result->ok, &field);
  napi_set_named_property(env, value, "ok", field);
  if (result->ok) {
    const char* names[] = {"latitude", "longitude", "accuracy", "timestamp"};
    const double values[] = {result->latitude, result->longitude, result->accuracy, result->timestamp};
    for (int i = 0; i < 4; ++i) { napi_create_double(env, values[i], &field); napi_set_named_property(env, value, names[i], field); }
  } else {
    napi_create_int32(env, result->code, &field);
    napi_set_named_property(env, value, "code", field);
  }
  napi_resolve_deferred(env, static_cast<napi_deferred>(context), value);
}
static void FinishLocation(const std::shared_ptr<LocationRequest>& request, LocationResult result) {
  if (request->finished.exchange(true)) return;
  if (result.ok && (!std::isfinite(result.latitude) || std::abs(result.latitude) > 90 || !std::isfinite(result.longitude) || std::abs(result.longitude) > 180 || !std::isfinite(result.accuracy) || result.accuracy < 0 || !std::isfinite(result.timestamp))) result = {};
  auto* data = new LocationResult(result);
  if (napi_call_threadsafe_function(request->function, data, napi_tsfn_nonblocking) != napi_ok) delete data;
  napi_release_threadsafe_function(request->function, napi_tsfn_release);
  std::lock_guard<std::mutex> guard(requestsMutex);
  requests.erase(request.get());
}
static std::shared_ptr<LocationRequest> NewLocationRequest(napi_env env, napi_value* promise) {
  napi_deferred deferred;
  if (napi_create_promise(env, &deferred, promise) != napi_ok) return nullptr;
  napi_value name;
  napi_create_string_utf8(env, "BarberOS system location", NAPI_AUTO_LENGTH, &name);
  auto request = std::make_shared<LocationRequest>();
  if (napi_create_threadsafe_function(env, nullptr, nullptr, name, 1, 1, nullptr, nullptr, deferred, DeliverLocation, &request->function) != napi_ok) return nullptr;
  napi_unref_threadsafe_function(env, request->function);
  std::lock_guard<std::mutex> guard(requestsMutex);
  requests[request.get()] = request;
  return request;
}
static void CancelLocationRequests(void*) {
  std::lock_guard<std::mutex> guard(requestsMutex);
  for (const auto& entry : requests) {
    if (!entry.second->finished.exchange(true)) napi_release_threadsafe_function(entry.second->function, napi_tsfn_abort);
  }
  requests.clear();
}
