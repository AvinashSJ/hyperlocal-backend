import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const baseApi = createApi({
  reducerPath: "baseApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/admin/" }),
  tagTypes: [
    "Dashboard",
    "Categories",
    "Products",
    "ProductVariants",
    "ProductImages",
    "Orders",
    "Customers",
    "Banners",
    "Settings",
    "DeliveryZones",
    "DeliverySlots",
    "Notifications",
  ],
  endpoints: () => ({}),
});
