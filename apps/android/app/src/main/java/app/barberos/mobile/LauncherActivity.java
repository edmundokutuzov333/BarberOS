package app.barberos.mobile;

import android.net.Uri;
import android.os.Bundle;

/** Browser-backed runtime: first-party cookies, camera, file chooser and OAuth stay in the browser sandbox. */
public final class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static boolean isTrusted(Uri requested) {
        return requested != null && "https".equalsIgnoreCase(requested.getScheme())
                && "barber-os-orpin.vercel.app".equalsIgnoreCase(requested.getHost())
                && requested.getUserInfo() == null && (requested.getPort() == -1 || requested.getPort() == 443);
    }

    @Override protected void onCreate(Bundle state) {
        // The helper may forward the original intent separately from getLaunchingUrl().
        // Remove untrusted input before the helper sees it, including explicit exported-activity intents.
        if (!isTrusted(getIntent().getData())) getIntent().setData(null);
        super.onCreate(state);
    }

    @Override protected Uri getLaunchingUrl() {
        Uri requested = getIntent().getData();
        return isTrusted(requested) ? requested : Uri.parse("https://barber-os-orpin.vercel.app/");
    }
}
