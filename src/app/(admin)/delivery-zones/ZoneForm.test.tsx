// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

// ZoneForm uses useActionState (React 19: renderable in both server and
// client environments) and imports the server actions. We stub the module
// so no actual DB/transport code runs during SSR.
vi.mock("./actions", () => ({
  createDeliveryZone: vi.fn(),
  updateDeliveryZone: vi.fn(),
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, width, height, className, style }: { icon: string; width?: number; height?: number; className?: string; style?: React.CSSProperties }) => (
    <span data-icon={icon} data-width={width} data-height={height} className={className} style={style} />
  ),
}));

import ZoneForm, { type StoreOption } from "./ZoneForm";
import type { ZoneForEdit } from "./actions";

const stores: StoreOption[] = [
  { id: "s-1", name: "ARUUN", delivery_radius_km: 15 },
  { id: "s-2", name: "SKYYWAY", delivery_radius_km: 12 },
];

const storeScopedZone: ZoneForEdit = {
  id: "z-1",
  store_id: "s-1",
  name: "Zone 1",
  pincodes: ["560001"],
  radius_km: 10,
  delivery_charge: 45,
  free_delivery_min_order: 500,
  min_order_value: null,
  max_order_value: 0,
  min_distance_km: 3,
  max_distance_km: 15,
  is_active: true,
  is_express: false,
  boundary: null,
};

describe("ZoneForm", () => {
  it("defaults a NEW superadmin zone to Radius mode with a store <select> and prefilled radius", () => {
    const html = renderToString(
      <ZoneForm zone={null} onClose={() => {}} storeId={null} stores={stores} />,
    );
    expect(html).toContain("Radius");
    // superadmin -> store <select> with both options + a hidden-store fallback absent
    expect(html).toMatch(/<select/);
    expect(html).toContain('value="s-1"');
    expect(html).toContain('value="s-2"');
    // radius field present with empty value (no store selected yet)
    expect(html).toMatch(/name="radius_km"/);
  });

  it("defaults a NEW store-scoped zone to Radius mode with a hidden store_id", () => {
    const html = renderToString(
      <ZoneForm zone={null} onClose={() => {}} storeId="s-1" stores={stores} />,
    );
    expect(html).toMatch(/name="store_id" value="s-1"/);
    expect(html).toMatch(/name="radius_km"/);
  });

  it("prefills radius from the zone's saved value on EDIT (not the store's current radius)", () => {
    const html = renderToString(
      <ZoneForm zone={storeScopedZone} onClose={() => {}} storeId="s-1" stores={stores} />,
    );
    // The radius input holds the zone's saved radius (10), not the store's radius (15).
    expect(html).toMatch(/name="radius_km" value="10"/);
    // max_distance_km also renders 15, so target the radius input specifically.
    const radiusField = /name="radius_km" value="10"/;
    expect(html.match(radiusField)).not.toBeNull();
  });

  it("switches an existing polygon zone to polygon mode and shows its boundary", () => {
    const zone: ZoneForEdit = {
      ...storeScopedZone,
      radius_km: 0,
      boundary: [[12.97, 77.59], [12.98, 77.6], [12.96, 77.61]],
    };
    const html = renderToString(
      <ZoneForm zone={zone} onClose={() => {}} storeId="s-1" stores={stores} />,
    );
    expect(html).toContain("[[12.97,77.59],[12.98,77.6],[12.96,77.61]]");
    expect(html).toMatch(/name="radius_km" value="0"/);
  });
});
