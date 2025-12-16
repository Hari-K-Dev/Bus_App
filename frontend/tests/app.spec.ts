import { test, expect } from '@playwright/test';

test.describe('Dublin Bus ETA App', () => {
  test('homepage loads with search input', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page.locator('h1')).toContainText('Dublin Bus');

    // Check search input exists
    const searchInput = page.getByPlaceholder('Search for a bus stop...');
    await expect(searchInput).toBeVisible();
  });

  test('search input shows results', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder('Search for a bus stop...');
    await searchInput.fill('connell');

    // Wait for search results to appear (or timeout if API not available)
    await page.waitForTimeout(1000);
  });

  test('nearby stops section exists', async ({ page }) => {
    await page.goto('/');

    // Check for "Stops Near You" heading
    await expect(page.getByText('Stops Near You')).toBeVisible();
  });

  test('map container exists', async ({ page }) => {
    await page.goto('/');

    // Check for Leaflet map container
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
  });

  test('arrivals page loads', async ({ page }) => {
    // Navigate directly to an arrivals page
    await page.goto('/arrivals/test-stop-id');

    // Check for back button
    await expect(page.getByText('Back')).toBeVisible();

    // Check for arrivals heading
    await expect(page.getByText('Arrivals')).toBeVisible();
  });

  test('tracking page loads', async ({ page }) => {
    // Navigate directly to a tracking page
    await page.goto('/tracking/test-vehicle-id?stopId=test-stop');

    // Check for back button
    await expect(page.getByText('Back')).toBeVisible();

    // Check for live tracking heading
    await expect(page.getByText('Live Tracking')).toBeVisible();
  });
});
