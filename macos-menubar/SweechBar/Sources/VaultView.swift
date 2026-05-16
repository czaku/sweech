import SwiftUI

/// Two-pane view: Accounts (vault identities) on the left, Workspaces on the
/// right. Select an account, then click a compatible workspace to mount the
/// account into it via `sweech assign`.
///
/// Compatibility:
///   anthropic account → claude workspace only
///   openai account    → codex workspace only
struct VaultView: View {
    @ObservedObject var service: SweechService
    @State private var selectedAccountId: String?
    @State private var workingWorkspace: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header

            HStack(alignment: .top, spacing: 12) {
                accountsPane
                Divider()
                workspacesPane
            }

            if let err = service.lastAssignError {
                Text(err)
                    .font(.system(size: 10))
                    .foregroundStyle(.red)
                    .padding(.top, 4)
            }
            if let summary = service.lastRefreshSummary {
                Text(summary)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
            }
        }
        .padding(10)
        .onAppear {
            service.fetchVault()
            if service.accounts.isEmpty { service.fetch() }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Vault")
                .font(.system(size: 12, weight: .bold))
            Spacer()
            Button(action: { service.fetchVault(); service.fetch() }) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10))
            }
            .buttonStyle(.plain)
            .help("Reload vault + workspaces")

            Button(action: { service.refreshVaultTokens() }) {
                Image(systemName: "key.fill")
                    .font(.system(size: 10))
            }
            .buttonStyle(.plain)
            .help("Refresh expiring OAuth tokens")
        }
    }

    // MARK: - Accounts pane

    private var accountsPane: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Accounts (\(service.vaultAccounts.count))")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)

            if service.vaultAccounts.isEmpty {
                Text("Empty — run `sweech accounts import`")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            } else {
                ForEach(groupedAccounts(), id: \.0) { kind, list in
                    Text(kind == "anthropic" ? "Anthropic" : kind == "openai" ? "OpenAI" : kind)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                    ForEach(list) { account in
                        accountRow(account)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func accountRow(_ account: VaultAccount) -> some View {
        let isSelected = selectedAccountId == account.id
        return Button(action: { selectedAccountId = isSelected ? nil : account.id }) {
            HStack(spacing: 6) {
                Circle()
                    .fill(account.kind == "anthropic" ? Color.orange : Color.green)
                    .frame(width: 6, height: 6)
                VStack(alignment: .leading, spacing: 1) {
                    Text(account.displayEmail)
                        .font(.system(size: 11, weight: isSelected ? .bold : .regular))
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        if let plan = account.plan {
                            Text(plan).font(.system(size: 9)).foregroundStyle(.secondary)
                        }
                        if let exp = account.expiryLabel {
                            Text("· \(exp)")
                                .font(.system(size: 9))
                                .foregroundStyle(exp == "expired" ? .red : .secondary)
                        }
                        if let status = account.status, status != "ok" {
                            Text("· \(status)")
                                .font(.system(size: 9))
                                .foregroundStyle(.red)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 2)
            .padding(.horizontal, 4)
            .background(isSelected ? Color.accentColor.opacity(0.15) : Color.clear)
            .cornerRadius(4)
        }
        .buttonStyle(.plain)
    }

    private func groupedAccounts() -> [(String, [VaultAccount])] {
        var map: [String: [VaultAccount]] = [:]
        for a in service.vaultAccounts {
            map[a.kind, default: []].append(a)
        }
        return map.keys.sorted().map { ($0, map[$0]!.sorted { $0.email < $1.email }) }
    }

    // MARK: - Workspaces pane

    private var workspacesPane: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Workspaces (\(workspaceRows().count))")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)

            if workspaceRows().isEmpty {
                Text("No workspaces found.")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            } else {
                ForEach(workspaceRows(), id: \.commandName) { account in
                    workspaceRow(account)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func workspaceRows() -> [SweechAccount] {
        // Only show workspaces that are first-party claude/codex (not external
        // provider routes). Those are what vault assignments apply to.
        service.accounts.filter { acc in
            (acc.cliType == "claude" || acc.cliType == "codex")
                && (acc.provider == nil || acc.provider == "anthropic" || acc.provider == "openai")
        }
    }

    private func workspaceRow(_ ws: SweechAccount) -> some View {
        let selected = selectedVaultAccount()
        let cliType = ws.cliType ?? "?"
        let canAssign = selected?.isCompatible(with: cliType) ?? false
        let busy = workingWorkspace == ws.commandName
        let disabled = selected == nil || !canAssign || busy
        let helpText: String
        if selected != nil && !canAssign {
            helpText = "Incompatible: \(selected?.kind ?? "?") cannot mount into \(cliType)"
        } else {
            helpText = "Mount selected account into \(ws.commandName)"
        }

        return Button(action: {
            guard let acct = selected, acct.isCompatible(with: cliType) else { return }
            workingWorkspace = ws.commandName
            service.assignAccount(workspaceCommandName: ws.commandName, email: acct.email) { _ in
                workingWorkspace = nil
            }
        }) {
            workspaceRowBody(ws: ws, cliType: cliType, canAssign: canAssign, busy: busy, hasSelection: selected != nil)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .help(helpText)
    }

    private func selectedVaultAccount() -> VaultAccount? {
        guard let id = selectedAccountId else { return nil }
        return service.vaultAccounts.first(where: { $0.id == id })
    }

    private func workspaceRowBody(ws: SweechAccount, cliType: String, canAssign: Bool, busy: Bool, hasSelection: Bool) -> some View {
        let iconName = cliType == "claude" ? "c.circle.fill" : "circle.dotted"
        let iconColor: Color = cliType == "claude" ? .orange : .green
        let activeEmail: String? = ws.activeAccount.map { acc in
            acc.email.hasSuffix("@unknown.local") ? "(no email)" : acc.email
        }
        let bg: Color = canAssign && hasSelection ? Color.accentColor.opacity(0.05) : Color.clear
        let opacity: Double = hasSelection && !canAssign ? 0.45 : 1.0

        return HStack(spacing: 6) {
            Image(systemName: iconName).font(.system(size: 11)).foregroundStyle(iconColor)
            VStack(alignment: .leading, spacing: 1) {
                Text(ws.commandName).font(.system(size: 11, weight: .medium)).lineLimit(1)
                if let email = activeEmail {
                    Text(email).font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(1)
                } else {
                    Text("no account mounted").font(.system(size: 9)).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
            workspaceRowTrailing(busy: busy, hasSelection: hasSelection, canAssign: canAssign)
        }
        .padding(.vertical, 3)
        .padding(.horizontal, 4)
        .background(bg)
        .cornerRadius(4)
        .opacity(opacity)
    }

    @ViewBuilder
    private func workspaceRowTrailing(busy: Bool, hasSelection: Bool, canAssign: Bool) -> some View {
        if busy {
            ProgressView().controlSize(.small)
        } else if hasSelection {
            Image(systemName: canAssign ? "arrow.right.circle.fill" : "xmark.circle")
                .foregroundStyle(canAssign ? Color.accentColor : Color.secondary.opacity(0.4))
                .font(.system(size: 11))
        } else {
            EmptyView()
        }
    }
}
