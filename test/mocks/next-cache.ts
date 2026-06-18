import { vi } from "vitest";

export const revalidatePathMock = vi.fn();
export const revalidateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));
