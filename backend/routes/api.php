<?php

use App\Http\Controllers\AuthenticationController;
use App\Http\Controllers\CartController;
use App\Http\Controllers\CatalogController;
use App\Http\Controllers\CatalogMediaController;
use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\FulfilmentController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\MfaController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\ReportingController;
use App\Http\Controllers\ReturnController;
use App\Http\Controllers\StaffController;
use App\Http\Middleware\CartIdentity;
use App\Http\Middleware\CurrentIdentity;
use App\Http\Middleware\TrustedBrowser;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['data' => ['status' => 'ok']]));

Route::middleware([TrustedBrowser::class])->prefix('auth')->group(function (): void {
    Route::post('/register', [AuthenticationController::class, 'register'])->middleware('throttle:identity-register');
    Route::post('/login', [AuthenticationController::class, 'login'])->middleware('throttle:identity-login');
    Route::post('/password/forgot', [AuthenticationController::class, 'forgot'])->middleware('throttle:identity-recovery');
    Route::post('/password/reset', [AuthenticationController::class, 'reset'])->middleware('throttle:identity-reset');
    Route::middleware(['auth:web', CurrentIdentity::class])->group(function (): void {
        Route::post('/mfa/enroll', [MfaController::class, 'enroll'])->middleware('throttle:identity-mfa-enroll');
        Route::post('/mfa/confirm', [MfaController::class, 'confirm'])->middleware('throttle:identity-mfa-enroll');
        Route::post('/mfa/challenge', [MfaController::class, 'challenge'])->middleware('throttle:identity-mfa');
        Route::post('/mfa/recovery-codes', [MfaController::class, 'regenerate'])->middleware('throttle:identity-mfa');
        Route::post('/reauthenticate', [MfaController::class, 'reauthenticate'])->middleware('throttle:identity-reauth');
        Route::get('/me', [AuthenticationController::class, 'me']);
        Route::post('/logout', [AuthenticationController::class, 'logout']);
    });
});

Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class])->group(function (): void {
    Route::get('/customer', [AuthenticationController::class, 'me']);
    Route::get('/admin/access', fn () => response()->json(['data' => ['access' => 'staff']]))->middleware('can:staff.access');
});

Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'throttle:identity-staff'])->prefix('admin/staff')->group(function (): void {
    Route::post('/', [StaffController::class, 'provision'])->middleware('can:staff.provision');
    Route::patch('/{id}/roles', [StaffController::class, 'role'])->whereUuid('id')->middleware('can:roles.assign');
    Route::post('/{id}/disable', [StaffController::class, 'disable'])->whereUuid('id')->middleware('can:staff.provision');
    Route::post('/{id}/mfa-reset', [StaffController::class, 'resetMfa'])->whereUuid('id')->middleware('can:security.configure');
});

Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'throttle:catalog-admin'])->prefix('admin/inventory')->group(function (): void {
    Route::get('/', [InventoryController::class, 'index'])->middleware('can:inventory.read');
    Route::get('/{id}', [InventoryController::class, 'show'])->whereUuid('id')->middleware('can:inventory.read');
    Route::post('/{id}/opening', [InventoryController::class, 'opening'])->whereUuid('id')->middleware('can:inventory.adjust');
    Route::post('/{id}/adjustments', [InventoryController::class, 'adjust'])->whereUuid('id')->middleware('can:inventory.adjust');
    Route::get('/{id}/movements', [InventoryController::class, 'movements'])->whereUuid('id')->middleware('can:inventory.movements.read');
});

Route::middleware('throttle:catalog-public')->group(function (): void {
    Route::get('/products', [CatalogController::class, 'index']);
    Route::get('/products/{slug}', [CatalogController::class, 'show'])->where('slug', '[a-z0-9-]+');
    Route::get('/search', [CatalogController::class, 'index']);
    Route::get('/categories/{slug}', [CatalogController::class, 'categoryShow'])->where('slug', '[a-z0-9-]+');
    Route::get('/categories', [CatalogController::class, 'categories']);
    Route::get('/media/{id}/{size}', [CatalogMediaController::class, 'image'])->whereUuid('id')->where('size', '320|640|1280');
});
Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'throttle:catalog-admin'])->prefix('admin')->group(function (): void {
    $c = CatalogController::class;
    Route::get('/products', [$c, 'adminIndex']);
    Route::post('/products', [$c, 'createProduct'])->middleware('can:catalog.create_update');
    Route::get('/products/{id}', [$c, 'adminShow'])->whereUuid('id');
    Route::patch('/products/{id}', [$c, 'updateProduct'])->whereUuid('id')->middleware('can:catalog.create_update');
    Route::post('/products/{id}/publication', [$c, 'publication'])->whereUuid('id')->middleware('can:catalog.publish_archive');
    Route::post('/products/{id}/archive', [$c, 'archive'])->whereUuid('id')->middleware('can:catalog.publish_archive');
    Route::post('/products/{id}/options', [$c, 'addOption'])->whereUuid('id')->middleware('can:catalog.create_update');
    Route::post('/products/{id}/variants', [$c, 'createVariant'])->whereUuid('id')->middleware('can:catalog.create_update');
    Route::post('/options/{id}/values', [$c, 'addValues'])->whereUuid('id')->middleware('can:catalog.create_update');
    Route::patch('/variants/{id}', [$c, 'updateVariant'])->whereUuid('id')->middleware('can:catalog.create_update');
    Route::get('/categories/{slug}', [CatalogController::class, 'categoryShow'])->where('slug', '[a-z0-9-]+');
    Route::get('/categories', [$c, 'adminCategories']);
    Route::post('/categories', [$c, 'createCategory'])->middleware('can:catalog.create_update');
    Route::patch('/categories/{id}', [$c, 'updateCategory'])->whereUuid('id')->middleware('can:catalog.create_update');
    $m = CatalogMediaController::class;
    Route::middleware('can:media.manage')->group(function () use ($m): void {
        Route::post('/media/uploads', [$m, 'intent']);
        Route::post('/media/{id}/upload', [$m, 'upload'])->whereUuid('id')->middleware('signed:relative')->name('catalog.upload');
        Route::post('/media/{id}/complete', [$m, 'complete'])->whereUuid('id');
        Route::patch('/media/{id}', [$m, 'updateMedia'])->whereUuid('id');
        Route::delete('/media/{id}', [$m, 'retire'])->whereUuid('id');
    });
});

Route::middleware([TrustedBrowser::class, CartIdentity::class, 'throttle:cart'])->prefix('cart')->group(function (): void {
    Route::get('/', [CartController::class, 'show']);
    Route::post('/items', [CartController::class, 'add']);
    Route::patch('/items/{id}', [CartController::class, 'update'])->whereUuid('id');
    Route::delete('/items/{id}', [CartController::class, 'remove'])->whereUuid('id');
    Route::delete('/', [CartController::class, 'clear']);
});

Route::middleware([TrustedBrowser::class, CartIdentity::class, 'throttle:checkout'])->prefix('checkout')->group(function (): void {
    $c = CheckoutController::class;
    Route::get('/destinations', [$c, 'destinations']);
    Route::get('/current', [$c, 'current']);
    Route::post('/', [$c, 'begin']);
    Route::get('/{id}', [$c, 'show'])->whereUuid('id');
    Route::patch('/{id}/address', [$c, 'address'])->whereUuid('id');
    Route::post('/{id}/validate', [$c, 'validateCheckout'])->whereUuid('id');
    Route::post('/{id}/reserve', [$c, 'reserve'])->whereUuid('id');
    Route::delete('/{id}', [$c, 'cancel'])->whereUuid('id');
});
Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'throttle:checkout'])->group(function (): void {
    $c = CheckoutController::class;
    Route::get('/addresses', [$c, 'addresses']);
    Route::post('/addresses', [$c, 'saveAddress']);
    Route::delete('/addresses/{id}', [$c, 'deleteAddress'])->whereUuid('id');
    Route::post('/admin/checkout-configurations', [$c, 'publish'])->middleware(['can:tax.configure', 'can:shipping.configure']);
});

Route::middleware([TrustedBrowser::class, CartIdentity::class, 'throttle:orders'])->prefix('orders')->group(function (): void {
    $c = OrderController::class;
    Route::post('/', [$c, 'create']);
    Route::get('/', [$c, 'index'])->middleware('auth:web');
    Route::get('/{id}', [$c, 'show'])->whereUuid('id');
    Route::post('/{id}/cancel', [$c, 'cancel'])->whereUuid('id');
});
Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'throttle:orders', 'can:orders.read'])->prefix('admin/orders')->group(function (): void {
    $c = OrderController::class;
    Route::get('/', [$c, 'adminIndex']);
    Route::get('/{id}', [$c, 'adminShow'])->whereUuid('id');
    Route::post('/{id}/transitions', [$c, 'adminCancel'])->whereUuid('id')->middleware('can:orders.cancel');
});

// Ingress is handled before session/body middleware; route retained for discovery.
Route::post('/webhooks/paystack', fn () => abort(503));
Route::middleware([TrustedBrowser::class, CartIdentity::class, 'throttle:payments'])->prefix('orders/{id}')->whereUuid('id')->group(function (): void {
    $p = PaymentController::class;
    Route::post('/payment-attempts', [$p, 'initialize']);
    Route::get('/payment-status', [$p, 'status']);
    Route::post('/payment-attempts/{attempt}/verify', [$p, 'verify'])->whereUuid('attempt');
});
Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'can:payments.reconcile', 'throttle:payments'])->prefix('admin/payments')->group(function (): void {
    $p = PaymentController::class;
    Route::get('/', [$p, 'adminIndex']);
    Route::get('/{attempt}', [$p, 'adminShow'])->whereUuid('attempt');
    Route::post('/{attempt}/reconcile', [$p, 'reconcile'])->whereUuid('attempt');
});

Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'throttle:orders', 'can:orders.read'])->prefix('admin/orders/{id}')->whereUuid('id')->group(function (): void {
    $f = FulfilmentController::class;
    Route::get('/shipment', [$f, 'show']);
    Route::post('/shipment', [$f, 'command'])->defaults('action', 'create')->middleware('can:shipments.record');
    Route::patch('/shipment', [$f, 'command'])->defaults('action', 'update')->middleware('can:shipments.record');
    Route::post('/processing', [$f, 'command'])->defaults('action', 'processing')->middleware('can:orders.prepare');
    Route::post('/ship', [$f, 'command'])->defaults('action', 'ship')->middleware('can:shipments.record');
    Route::post('/deliver', [$f, 'command'])->defaults('action', 'deliver')->middleware('can:delivery.record');
});

Route::middleware([TrustedBrowser::class, CartIdentity::class, 'throttle:orders'])->prefix('orders/{id}/returns')->whereUuid('id')->group(function (): void {
    Route::get('/', [ReturnController::class, 'index']);
    Route::post('/', [ReturnController::class, 'create']);
});
Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'throttle:orders', 'can:returns.read'])->prefix('admin/returns')->group(function (): void {
    $c = ReturnController::class;
    Route::get('/', [$c, 'adminIndex']);
    Route::post('/policies', [$c, 'publish'])->middleware('can:returns.decide');
    Route::get('/{id}', [$c, 'show'])->whereUuid('id');
    foreach (['review' => 'returns.review', 'approve' => 'returns.decide', 'reject' => 'returns.decide', 'receive' => 'returns.review', 'inspect' => 'returns.decide', 'restock' => 'inventory.adjust'] as $action => $permission) {
        Route::post('/{id}/'.$action, [$c, 'command'])->whereUuid('id')->defaults('action', $action)->middleware('can:'.$permission);
    }
    Route::post('/{id}/refund/approve', [$c, 'approveRefund'])->whereUuid('id')->middleware('can:refunds.approve');
    foreach (['submit', 'reconcile'] as $action) {
        Route::post('/{id}/refund/'.$action, [$c, 'refundCommand'])->whereUuid('id')->defaults('action', $action)->middleware('can:refunds.submit');
    }
});

Route::middleware([TrustedBrowser::class, 'auth:web', CurrentIdentity::class, 'can:staff.access', 'throttle:catalog-admin'])->prefix('admin')->group(function (): void {
    Route::get('/dashboard', ReportingController::class);
    Route::get('/reports/{report}', ReportingController::class)->where('report', 'sales|orders|stock|products|returns|payments|notifications');
});
