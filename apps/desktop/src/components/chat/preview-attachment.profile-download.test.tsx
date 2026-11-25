import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $connection } from '@/store/session'

import { PreviewAttachment } from './preview-attachment'

const { assertSessionOwnerResolved, resolveSessionOwner, saveGatewayFile } = vi.hoisted(() => ({
  assertSessionOwnerResolved: vi.fn((owner: unknown) => {
    if (!owner) {
      throw new Error('Session owner could not be resolved')
    }
  }),
  resolveSessionOwner: vi.fn(),
  saveGatewayFile: vi.fn(async () => ({ path: '/Users/me/Downloads/report.ps1', saved: true }))
}))

vi.mock('@/app/chat/session-view', () => ({
  useSessionView: () => ({
    $cwd: atom('/home/gwen'),
    $runtimeId: atom<null | string>(null),
    $storedId: atom<null | string>('ms-session')
  })
}))

vi.mock('@/app/session/hooks/use-session-actions/utils', () => ({ resolveSessionOwner }))

vi.mock('@/lib/desktop-fs', () => ({
  isDesktopFsRemoteMode: () => true,
  readDesktopDir: vi.fn(),
  readDesktopFileDataUrl: vi.fn(),
  readDesktopFileText: vi.fn()
}))

vi.mock('@/store/session-owner-resolution', () => ({ assertSessionOwnerResolved }))

vi.mock('@/store/preview', () => ({
  $previewTabSources: atom<string[]>([]),
  closePreviewForSource: vi.fn(),
  openPreview: vi.fn()
}))

describe('PreviewAttachment remote profile download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSessionOwner.mockResolvedValue('ms-admin')
    window.hermesDesktop = { saveGatewayFile } as never
    $connection.set({ connectionId: 'ambient-host', mode: 'remote', profile: 'default' } as never)
  })

  afterEach(() => {
    cleanup()
    $connection.set(null)
  })

  async function clickDownload() {
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Download' }))
    })
  }

  it('downloads a legacy profile owner without combining it with the ambient connection', async () => {
    render(<PreviewAttachment target="/home/gwen/projects/report.ps1" />)
    await clickDownload()

    await waitFor(() =>
      expect(saveGatewayFile).toHaveBeenCalledWith({
        path: '/home/gwen/projects/report.ps1',
        profile: 'ms-admin',
        sessionId: 'ms-session',
        suggestedName: 'report.ps1'
      })
    )
    expect(assertSessionOwnerResolved).toHaveBeenCalledWith('ms-admin', {
      method: 'file.download',
      sessionId: 'ms-session'
    })
  })

  it('pins an exact owner to its connection and target profile', async () => {
    resolveSessionOwner.mockResolvedValue({
      connectionId: 'ms-host',
      profile: 'desktop-ms',
      targetProfile: 'ms-admin'
    })
    render(<PreviewAttachment target="/home/gwen/projects/report.ps1" />)
    await clickDownload()

    await waitFor(() =>
      expect(saveGatewayFile).toHaveBeenCalledWith({
        connectionId: 'ms-host',
        path: '/home/gwen/projects/report.ps1',
        profile: 'ms-admin',
        sessionId: 'ms-session',
        suggestedName: 'report.ps1'
      })
    )
  })

  it('fails closed instead of downloading through the ambient backend when ownership is unresolved', async () => {
    resolveSessionOwner.mockResolvedValue(undefined)
    render(<PreviewAttachment target="/home/gwen/projects/report.ps1" />)
    await clickDownload()

    await waitFor(() => expect(assertSessionOwnerResolved).toHaveBeenCalled())
    expect(saveGatewayFile).not.toHaveBeenCalled()
  })
})
