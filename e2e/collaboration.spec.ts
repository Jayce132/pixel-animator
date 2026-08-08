import { expect, test } from '@playwright/test';

const drawFirstPixel = async (page: import('@playwright/test').Page): Promise<void> => {
    await page.locator('.palette-grid .palette-color').first().click();
    const editor = page.locator('.main-sprite-editor');
    await expect(editor).toBeVisible();
    const box = await editor.boundingBox();
    if (!box) throw new Error('Editor has no layout box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

test('creates a live room, admits one guest, and rejects a third tab', async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const host = await context.newPage();
    await host.goto('/');
    await drawFirstPixel(host);
    await host.getByRole('button', { name: 'Share' }).click();
    await host.getByRole('button', { name: 'Invite a collaborator' }).click();
    await expect(host.getByText('You are Host')).toBeVisible();
    const inviteHash = new URL(host.url()).hash;
    expect(inviteHash).toContain('room=');
    expect(inviteHash).toContain('key=');

    const guest = await context.newPage();
    await guest.goto(`/${inviteHash}`);
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Join as Guest?' })).toBeHidden({ timeout: 10_000 });
    await guest.getByRole('button', { name: 'Share' }).click();
    await expect(guest.getByText('You are Guest')).toBeVisible();
    await guest.getByLabel('Close').click();

    // The Host modal auto-closes when its first Guest arrives. Keep this
    // tolerant of the tiny race where the test reaches it first.
    const hostCloseButton = host.getByLabel('Close');
    if (await hostCloseButton.isVisible()) await hostCloseButton.click();
    const guestCanvas = guest.locator('.editor-main-canvas');
    const beforeRemoteStroke = await guestCanvas.evaluate(canvas => (
        (canvas as HTMLCanvasElement).toDataURL()
    ));
    await host.locator('.palette-grid .palette-color').nth(1).click();
    const hostEditor = host.locator('.main-sprite-editor');
    const hostBox = await hostEditor.boundingBox();
    if (!hostBox) throw new Error('Host editor has no layout box');
    await host.mouse.click(hostBox.x + hostBox.width * 0.25, hostBox.y + hostBox.height * 0.25);
    await expect.poll(async () => guestCanvas.evaluate(canvas => (
        (canvas as HTMLCanvasElement).toDataURL()
    ))).not.toBe(beforeRemoteStroke);

    const third = await context.newPage();
    await third.goto(`/${inviteHash}`);
    await third.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(third.getByRole('alert')).toContainText(/already has a Host and Guest|session is full/i, {
        timeout: 10_000
    });

    // There is intentionally no reconnect/promotion mode in v1. When the Host
    // ends the session, both tabs immediately keep the merged drawing as local
    // projects, clear the room URL, and lose the session status light.
    const hostShareButton = host.getByRole('button', { name: 'Share' });
    await hostShareButton.click();
    await host.getByRole('button', { name: 'Leave session' }).click();
    await expect.poll(() => new URL(host.url()).hash).toBe('');
    await expect(hostShareButton.locator('.share-status-dot')).toHaveCount(0);
    await expect(guest.getByText('Collaborator left — this is now a local project')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => new URL(guest.url()).hash).toBe('');
    const guestShareButton = guest.getByRole('button', { name: 'Share' });
    await expect(guestShareButton.locator('.share-status-dot')).toHaveCount(0);
    await guestShareButton.click();
    await expect(guest.getByRole('button', { name: 'Invite a collaborator' })).toBeVisible();

    // The same teardown is role-symmetric: use that local project to create a
    // new room, admit a new Guest, then prove the Host also becomes local when
    // its Guest leaves.
    await guest.getByRole('button', { name: 'Invite a collaborator' }).click();
    await expect(guest.getByText('You are Host')).toBeVisible({ timeout: 10_000 });
    const secondInviteHash = new URL(guest.url()).hash;
    expect(secondInviteHash).toContain('room=');
    const secondGuest = await context.newPage();
    await secondGuest.goto(`/${secondInviteHash}`);
    await secondGuest.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(secondGuest.getByRole('heading', { name: 'Join as Guest?' }))
        .toBeHidden({ timeout: 10_000 });
    await secondGuest.getByRole('button', { name: 'Share' }).click();
    await expect(secondGuest.getByText('You are Guest')).toBeVisible();
    await secondGuest.getByRole('button', { name: 'Leave session' }).click();
    await expect(guest.getByText('Collaborator left — this is now a local project')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => new URL(guest.url()).hash).toBe('');
    await expect(guestShareButton.locator('.share-status-dot')).toHaveCount(0);

    await context.close();
});

test('hands off an immutable copy and revokes the offer after acknowledgement', async ({ browser }) => {
    test.setTimeout(45_000);
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const source = await context.newPage();
    await source.goto('/');
    await drawFirstPixel(source);
    await source.getByRole('button', { name: 'Share' }).click();
    await source.getByRole('button', { name: 'Share a copy' }).click();
    await expect(source.getByText('Copy offer active for 30 minutes')).toBeVisible();
    const copyLink = await source.evaluate(() => navigator.clipboard.readText());
    expect(copyLink).toContain('mode=copy');

    const receiver = await context.newPage();
    await receiver.goto(copyLink);
    await receiver.getByRole('button', { name: 'Get copy' }).click();
    await expect(receiver.getByRole('heading', { name: 'Get a copy of this project?' }))
        .toBeHidden({ timeout: 10_000 });
    await expect.poll(() => new URL(receiver.url()).hash).toBe('');
    await expect(source.getByText('Copy offer active for 30 minutes')).toBeHidden({ timeout: 10_000 });

    const sourceCanvas = source.locator('.editor-main-canvas');
    const sourceSnapshot = await sourceCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
    await receiver.locator('.palette-grid .palette-color').nth(2).click();
    const receiverEditor = receiver.locator('.main-sprite-editor');
    const receiverBox = await receiverEditor.boundingBox();
    if (!receiverBox) throw new Error('Receiver editor has no layout box');
    await receiver.mouse.click(
        receiverBox.x + receiverBox.width * 0.75,
        receiverBox.y + receiverBox.height * 0.75
    );
    await receiver.waitForTimeout(750);
    expect(await sourceCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL()))
        .toBe(sourceSnapshot);

    await context.close();
});
