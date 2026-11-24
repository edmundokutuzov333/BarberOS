#include "location.h"
#import <Foundation/Foundation.h>
#import <CoreLocation/CoreLocation.h>

@interface BarberLocationRequest : NSObject<CLLocationManagerDelegate> {
 @public std::shared_ptr<LocationRequest> result;
}
@property(nonatomic, strong) CLLocationManager* manager;
@property(nonatomic, strong) NSTimer* timer;
@property(nonatomic) BOOL authorizationRequested;
@property(nonatomic) BOOL requesting;
- (void)start;
- (void)finish:(LocationResult)value;
@end
static BarberLocationRequest* activeRequest;

@implementation BarberLocationRequest
- (void)finish:(LocationResult)value {
  BarberLocationRequest* keepAlive = self;
  [keepAlive.timer invalidate];
  [keepAlive.manager stopUpdatingLocation];
  keepAlive.manager.delegate = nil;
  keepAlive.timer = nil;
  keepAlive.manager = nil;
  FinishLocation(result, value);
  if (activeRequest == keepAlive) activeRequest = nil;
}
- (void)start {
  if (![CLLocationManager locationServicesEnabled]) { [self finish:LocationResult{}]; return; }
  self.manager = [[CLLocationManager alloc] init];
  self.manager.delegate = self;
  self.manager.desiredAccuracy = kCLLocationAccuracyHundredMeters;
  [self locationManagerDidChangeAuthorization:self.manager];
}
- (void)locationManagerDidChangeAuthorization:(CLLocationManager*)manager {
  if (result->finished.load()) return;
  const CLAuthorizationStatus status = manager.authorizationStatus;
  if (status == kCLAuthorizationStatusDenied || status == kCLAuthorizationStatusRestricted) {
    LocationResult error; error.code = 1; [self finish:error]; return;
  }
  if (status == kCLAuthorizationStatusNotDetermined) {
    if (!self.authorizationRequested) { self.authorizationRequested = YES; [manager requestWhenInUseAuthorization]; }
    return;
  }
  if (!self.requesting) {
    self.requesting = YES;
    self.timer = [NSTimer scheduledTimerWithTimeInterval:15 repeats:NO block:^(NSTimer*) { LocationResult error; error.code = 3; [self finish:error]; }];
    [manager requestLocation];
  }
}
- (void)locationManager:(CLLocationManager*)manager didUpdateLocations:(NSArray<CLLocation*>*)locations {
  CLLocation* point = locations.lastObject;
  if (!point || point.horizontalAccuracy < 0 || fabs(point.timestamp.timeIntervalSinceNow) > 360) { [self finish:LocationResult{}]; return; }
  LocationResult value; value.ok = true; value.latitude = point.coordinate.latitude; value.longitude = point.coordinate.longitude;
  value.accuracy = point.horizontalAccuracy; value.timestamp = point.timestamp.timeIntervalSince1970 * 1000;
  [self finish:value];
}
- (void)locationManager:(CLLocationManager*)manager didFailWithError:(NSError*)error {
  LocationResult value; value.code = error.code == kCLErrorDenied ? 1 : 2; [self finish:value];
}
@end
static napi_value RequestLocation(napi_env env, napi_callback_info) {
  napi_value promise;
  auto request = NewLocationRequest(env, &promise);
  if (!request) { napi_throw_error(env, nullptr, "Unable to create location request"); return nullptr; }
  dispatch_async(dispatch_get_main_queue(), ^{
    if (request->finished.load()) return;
    if (activeRequest) { FinishLocation(request, LocationResult{}); return; }
    activeRequest = [[BarberLocationRequest alloc] init];
    activeRequest->result = request;
    [activeRequest start];
  });
  return promise;
}
static void Cleanup(void* data) {
  if (activeRequest) { [activeRequest.timer invalidate]; [activeRequest.manager stopUpdatingLocation]; activeRequest.manager.delegate = nil; activeRequest = nil; }
  CancelLocationRequests(data);
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_value method;
  napi_create_function(env, "requestLocation", NAPI_AUTO_LENGTH, RequestLocation, nullptr, &method);
  napi_set_named_property(env, exports, "requestLocation", method);
  napi_add_env_cleanup_hook(env, Cleanup, nullptr);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
