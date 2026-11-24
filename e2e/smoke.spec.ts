import { expect, test } from "@playwright/test";

test.describe("frontend smoke tests", () => {
  test("health endpoint is available", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toMatchObject({
      status: "ok",
    });
  });

  test("English homepage loads", async ({ page }) => {
    const response = await page.goto("/en");

    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });

  test("get help page loads", async ({ page }) => {
    const response = await page.goto("/en/get-help");

    expect(response?.ok()).toBeTruthy();
    // The redesigned get-help screen is the language chooser: one button per locale.
    await expect(page.getByRole("button", { name: /English/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Español/ })).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  });

  test("login page loads", async ({ page }) => {
    const response = await page.goto("/en/auth/login");

    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });
});
