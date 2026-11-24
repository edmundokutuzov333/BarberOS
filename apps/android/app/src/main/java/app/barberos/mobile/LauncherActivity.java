package app.barberos.mobile;

import android.net.Uri;

/** Browser-backed runtime: first-party cookies, camera, file chooser and OAuth stay in the browser sandbox. */
public final class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override protected Uri getLaunchingUrl() {
        Uri requested = getIntent().getData();
        if (requested != null && "https".equals(requested.getScheme())
                && "barber-os-orpin.vercel.app".equals(requested.getHost())
                && requested.getUserInfo() == null && (requested.getPort() == -1 || requested.getPort() == 443)) {
            return requested;
        }
        return Uri.parse("https://barber-os-orpin.vercel.app/");
    }
}
