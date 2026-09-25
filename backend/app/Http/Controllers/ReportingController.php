<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReportRequest;
use App\Models\User;
use App\Reporting\OperationsReport;
use App\Reporting\OrderReport;
use App\Reporting\ReportWindow;
use App\Reporting\SalesReport;
use App\Reporting\StockReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class ReportingController
{
    public function __invoke(ReportRequest $request, string $report = 'dashboard'): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $allowed = ['orders' => $user->hasPermission('reports.orders'), 'stock' => $user->hasPermission('reports.stock'), 'sales' => $user->hasPermission('reports.sales'), 'products' => $user->hasPermission('reports.products')];
        $allowed['payments'] = $allowed['sales'] && $user->hasPermission('payments.reconcile');
        $allowed['returns'] = $allowed['orders'] && $user->hasPermission('returns.read');
        $allowed['notifications'] = $user->hasPermission('audit.read');
        abort_unless($report === 'dashboard' ? in_array(true, $allowed, true) : ($allowed[$report] ?? false), 403);
        $w = ReportWindow::fromInput($request->validated(), (string) config('reporting.timezone'));
        $page = (int) $request->input('page', 1);
        $data = DB::transaction(function () use ($w, $page, $request, $allowed, $report): array {
            DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            DB::statement("SET LOCAL statement_timeout = '5000ms'");
            $data = ['range' => $w->meta(), 'as_of' => now()->toIso8601String(), 'currency' => 'NGN'];
            foreach ($allowed as $section => $can) {
                if (! $can || ($report !== 'dashboard' && $report !== $section)) {
                    continue;
                }
                $data[$section] = match ($section) {
                    'orders' => app(OrderReport::class)->read($w, $page, $allowed['payments']),
                    'stock' => app(StockReport::class)->read($page, (string) $request->input('stock', 'all')),
                    'sales' => app(SalesReport::class)->read($w),
                    'products' => app(SalesReport::class)->products($w, $page),
                    'returns' => app(OperationsReport::class)->returns($w, $allowed['sales']),
                    'payments' => app(OperationsReport::class)->payments($w),
                    'notifications' => app(OperationsReport::class)->notifications(),
                };
            }

            return $data;
        });

        return response()->json(['data' => $data])->header('Cache-Control', 'private, no-store');
    }
}
