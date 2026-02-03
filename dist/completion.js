"use strict";
/**
 * Shell completion script generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBashCompletion = generateBashCompletion;
exports.generateZshCompletion = generateZshCompletion;
const config_1 = require("./config");
const aliases_1 = require("./aliases");
function generateBashCompletion() {
    const config = new config_1.ConfigManager();
    const aliasManager = new aliases_1.AliasManager();
    const profiles = config.getProfiles();
    const aliases = aliasManager.getAliases();
    const commandNames = profiles.map(p => p.commandName).join(' ');
    const aliasNames = Object.keys(aliases).join(' ');
    return `# Bash completion for sweech
_sweech_completion() {
    local cur prev commands
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    commands="add list ls remove rm info backup restore stats show alias discover completion"

    case "\${prev}" in
        sweech)
            COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
            return 0
            ;;
        remove|rm|show|stats)
            local profiles="${commandNames}"
            COMPREPLY=( $(compgen -W "\${profiles}" -- "\${cur}") )
            return 0
            ;;
        alias)
            if [[ \${COMP_CWORD} -eq 2 ]]; then
                COMPREPLY=( $(compgen -W "list remove" -- "\${cur}") )
            elif [[ \${COMP_CWORD} -eq 3 && "\${COMP_WORDS[2]}" == "remove" ]]; then
                local aliases="${aliasNames}"
                COMPREPLY=( $(compgen -W "\${aliases}" -- "\${cur}") )
            fi
            return 0
            ;;
        completion)
            COMPREPLY=( $(compgen -W "bash zsh" -- "\${cur}") )
            return 0
            ;;
    esac
}

complete -F _sweech_completion sweech
`;
}
function generateZshCompletion() {
    const config = new config_1.ConfigManager();
    const aliasManager = new aliases_1.AliasManager();
    const profiles = config.getProfiles();
    const aliases = aliasManager.getAliases();
    const commandNames = profiles.map(p => p.commandName).join(' ');
    const aliasNames = Object.keys(aliases).join(' ');
    return `#compdef sweech

_sweech() {
    local -a commands profiles aliases_list

    commands=(
        'add:Add a new provider'
        'list:List all configured providers'
        'ls:List all configured providers (alias)'
        'remove:Remove a configured provider'
        'rm:Remove a configured provider (alias)'
        'info:Show sweech configuration'
        'backup:Create encrypted backup'
        'restore:Restore from backup'
        'stats:Show usage statistics'
        'show:Show provider details'
        'alias:Manage command aliases'
        'discover:Discover available providers'
        'completion:Generate shell completion'
    )

    profiles=(${commandNames})
    aliases_list=(${aliasNames})

    case "$state" in
        command)
            _describe 'sweech commands' commands
            ;;
        profile)
            _arguments "*:profile:($profiles)"
            ;;
        alias_name)
            _arguments "*:alias:($aliases_list)"
            ;;
    esac

    case $words[2] in
        remove|rm|show|stats)
            _arguments "*:profile:($profiles)"
            ;;
        alias)
            if [[ $words[3] == "remove" ]]; then
                _arguments "*:alias:($aliases_list)"
            else
                _arguments "1:action:(list remove)"
            fi
            ;;
        completion)
            _arguments "1:shell:(bash zsh)"
            ;;
    esac
}

_sweech "$@"
`;
}
