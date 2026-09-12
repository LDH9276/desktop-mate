export async function openSettingsWindow(app, page) {
  const opened = app.waitForEvent('window');
  await page.getByRole('button', { name: '연결 및 설정', exact: true }).dispatchEvent('click');
  const settings = await opened;
  await settings.waitForSelector('.settings-panel');
  return settings;
}
