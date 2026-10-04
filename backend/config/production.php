<?php

return [
    // The default remains the existing verified external-TLS policy.
    // The Render profile is enabled only for Render's private injected URLs.
    'network_profile' => env('PRODUCTION_NETWORK_PROFILE', 'verified-tls'),
    'render_runtime' => env('RENDER') === 'true' && is_string(env('RENDER_SERVICE_ID')) && env('RENDER_SERVICE_ID') !== '',
];
