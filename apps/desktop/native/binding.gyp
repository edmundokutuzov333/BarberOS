{
  "targets": [
    {
      "target_name": "barberos_location",
      "defines": [
        "NAPI_VERSION=8"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "sources": [
              "location_mac.mm"
            ],
            "xcode_settings": {
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "MACOSX_DEPLOYMENT_TARGET": "13.0"
            },
            "link_settings": {
              "libraries": [
                "-framework Foundation",
                "-framework CoreLocation"
              ]
            }
          }
        ],
        [
          "OS=='win'",
          {
            "sources": [
              "location_win.cpp"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "AdditionalOptions": [
                  "/std:c++20",
                  "/EHsc"
                ],
                "ExceptionHandling": 1
              }
            },
            "libraries": [
              "windowsapp.lib",
              "runtimeobject.lib",
              "ole32.lib"
            ],
            "defines": [
              "_WIN32_WINNT=0x0A00",
              "WINVER=0x0A00",
              "NOMINMAX",
              "WIN32_LEAN_AND_MEAN"
            ]
          }
        ]
      ]
    }
  ]
}
