<?php

return [
    // The default remains the existing verified external-TLS policy.
    // The Render profile is enabled only for Render's private injected URLs.
    'network_profile' => env('PRODUCTION_NETWORK_PROFILE', 'verified-tls'),
    'render_runtime' => (bool) env('RENDER', false) && is_string(env('RENDER_SERVICE_ID')) && env('RENDER_SERVICE_ID') !== '',
    'render_cpu_count' => env('RENDER_CPU_COUNT'),
    // Missing configuration stays on the strict private-storage policy.
    'deployment_profile' => env('IRANTI_DEPLOYMENT_PROFILE', 'render-private'),
    'prelaunch_gate_enabled' => (bool) env('PRELAUNCH_GATE_ENABLED', false),
    'preview_noindex' => (bool) env('PRODUCTION_PREVIEW_NOINDEX', false),
];
