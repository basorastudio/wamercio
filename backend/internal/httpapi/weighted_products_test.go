package httpapi

import (
	"math"
	"testing"
)

func TestWeightedDefaults(t *testing.T) {
	product := Product{Format: "Libra", WeightedSaleEnabled: true, Price: 100}
	got := weightedDefaults(product)

	if got.WeightUnit != defaultWeightUnit {
		t.Fatalf("expected default unit %q, got %q", defaultWeightUnit, got.WeightUnit)
	}
	if got.MinimumWeight != defaultMinimumWeight {
		t.Fatalf("expected minimum weight %.2f, got %v", defaultMinimumWeight, got.MinimumWeight)
	}
	if got.WeightIncrement != defaultWeightIncrement {
		t.Fatalf("expected increment %.2f, got %v", defaultWeightIncrement, got.WeightIncrement)
	}
	if got.MinimumAmount != 25 {
		t.Fatalf("expected quarter-pound minimum amount 25, got %v", got.MinimumAmount)
	}
	if got.WeightPrecision != defaultWeightPrecision {
		t.Fatalf("expected precision %d, got %d", defaultWeightPrecision, got.WeightPrecision)
	}
	if !got.AllowWeightSales || !got.AllowAmountSales {
		t.Fatal("expected both weighted sale modes to be enabled")
	}
}

func TestProductIsWeightedRespectsExplicitSetting(t *testing.T) {
	if productIsWeighted(Product{Format: "Libra"}) {
		t.Fatal("format alone must not override a locally disabled weighted sale setting")
	}
	if !productIsWeighted(Product{Format: "Libra", WeightedSaleEnabled: true}) {
		t.Fatal("expected explicitly enabled product to be weighted")
	}
}

func TestRoundCurrency(t *testing.T) {
	cases := []struct {
		input float64
		want  float64
	}{
		{100.005, 100.01},
		{81.249, 81.25},
		{97.5, 97.5},
	}
	for _, tc := range cases {
		if got := roundCurrency(tc.input); got != tc.want {
			t.Fatalf("roundCurrency(%v) = %v, want %v", tc.input, got, tc.want)
		}
	}
}

func TestRoundPayableAmount(t *testing.T) {
	cases := []struct {
		input float64
		want  float64
	}{
		{93.4, 93},
		{93.49, 93},
		{93.5, 94},
		{93.75, 94},
	}
	for _, tc := range cases {
		if got := roundPayableAmount(tc.input); got != tc.want {
			t.Fatalf("roundPayableAmount(%v) = %v, want %v", tc.input, got, tc.want)
		}
	}
}

func TestNormalizeRequestedWeightUsesQuarterPoundSteps(t *testing.T) {
	cases := []struct {
		input float64
		want  float64
	}{
		{0, 0.25},
		{0.25, 0.25},
		{0.49, 0.5},
		{1.12, 1.0},
		{1.13, 1.25},
		{1.74, 1.75},
	}
	for _, tc := range cases {
		if got := normalizeRequestedWeight(tc.input, 0.25, 0.25); got != tc.want {
			t.Fatalf("normalizeRequestedWeight(%v) = %v, want %v", tc.input, got, tc.want)
		}
	}
}

func TestNormalizeInventoryStockUsesDecimalsOnlyForLibra(t *testing.T) {
	if got := normalizeInventoryStock(24.0001, "Libra"); got != 24.00 {
		t.Fatalf("normalizeInventoryStock libra = %v, want 24.00", got)
	}
	if got := normalizeInventoryStock(24.99, "Unidad"); got != 24 {
		t.Fatalf("normalizeInventoryStock unidad = %v, want 24", got)
	}
}

func TestNormalizeInventoryDeltaUsesDecimalsOnlyForLibra(t *testing.T) {
	if got := normalizeInventoryDelta(0.126, "Libra"); got != 0.13 {
		t.Fatalf("normalizeInventoryDelta libra = %v, want 0.13", got)
	}
	if got := normalizeInventoryDelta(-1.75, "Unidad"); got != -1 {
		t.Fatalf("normalizeInventoryDelta unidad = %v, want -1", got)
	}
}

func TestMinimumAmountForUnitPriceUsesQuarterPound(t *testing.T) {
	cases := []struct {
		price float64
		want  float64
	}{
		{75, 19},
		{100, 25},
		{320, 80},
		{1, 1},
	}
	for _, tc := range cases {
		if got := minimumAmountForUnitPrice(tc.price); got != tc.want {
			t.Fatalf("minimumAmountForUnitPrice(%v) = %v, want %v", tc.price, got, tc.want)
		}
	}
}

func TestAmountWeightBreakdownUsesFractionsOnlyForExactAmounts(t *testing.T) {
	cases := []struct {
		amount     float64
		price      float64
		wantWeight float64
		wantExact  bool
	}{
		{25, 100, 0.25, true},
		{50, 100, 0.50, true},
		{75, 100, 0.75, true},
		{100, 100, 1.00, true},
		{125, 100, 1.25, true},
		{150, 100, 1.50, true},
		{19, 75, 0.25, true},
		{38, 75, 0.50, true},
		{56, 75, 0.75, true},
		{75, 75, 1.00, true},
		{94, 75, 1.25, true},
		{37, 75, 0.49, false},
		{55, 75, 0.73, false},
		{74, 75, 0.99, false},
		{100, 75, 1.33, false},
		{35, 100, 0.35, false},
		{40, 100, 0.40, false},
		{45, 100, 0.45, false},
	}
	for _, tc := range cases {
		gotWeight, gotExact := amountWeightBreakdown(tc.amount, tc.price, 0.25, 0.25)
		if math.Abs(gotWeight-tc.wantWeight) > 0.000001 || gotExact != tc.wantExact {
			t.Fatalf(
				"amountWeightBreakdown(RD$%v, RD$%v/lb) = (%v, %v), want (%v, %v)",
				tc.amount,
				tc.price,
				gotWeight,
				gotExact,
				tc.wantWeight,
				tc.wantExact,
			)
		}
	}
}

func TestAmountWeightIsExact(t *testing.T) {
	if !amountWeightIsExact(38, 75, 0.25) {
		t.Fatal("RD$38 at RD$75/lb should equal 0.50 lb after whole-peso cash rounding")
	}
	if !amountWeightIsExact(94, 75, 0.25) {
		t.Fatal("RD$94 at RD$75/lb should be exact after whole-peso cash rounding")
	}
	if amountWeightIsExact(100, 75, 0.25) {
		t.Fatal("RD$100 at RD$75/lb should remain approximate")
	}
}

func BenchmarkCalculatePayableOrderTotal(b *testing.B) {
	prices := [...]float64{50, 75.25, 120, 149.99, 200, 310.50, 425, 500}
	quantities := [...]float64{1, 0.25, 2, 0.5, 3, 1.25, 0.75, 4}
	b.ReportAllocs()
	for b.Loop() {
		total := 0.0
		for index := range prices {
			total += roundPayableAmount(prices[index] * quantities[index])
		}
		if total == 0 {
			b.Fatal("unexpected zero total")
		}
	}
}
