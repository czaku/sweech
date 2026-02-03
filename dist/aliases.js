"use strict";
/**
 * Alias management for sweetch commands
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AliasManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class AliasManager {
    constructor() {
        const configDir = path.join(os.homedir(), '.sweech');
        this.aliasFile = path.join(configDir, 'aliases.json');
    }
    getAliases() {
        if (!fs.existsSync(this.aliasFile)) {
            return {};
        }
        try {
            const data = fs.readFileSync(this.aliasFile, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return {};
        }
    }
    addAlias(alias, command) {
        const aliases = this.getAliases();
        if (aliases[alias]) {
            throw new Error(`Alias '${alias}' already exists (points to '${aliases[alias]}')`);
        }
        aliases[alias] = command;
        fs.writeFileSync(this.aliasFile, JSON.stringify(aliases, null, 2));
    }
    removeAlias(alias) {
        const aliases = this.getAliases();
        if (!aliases[alias]) {
            throw new Error(`Alias '${alias}' does not exist`);
        }
        delete aliases[alias];
        fs.writeFileSync(this.aliasFile, JSON.stringify(aliases, null, 2));
    }
    resolveAlias(commandOrAlias) {
        const aliases = this.getAliases();
        return aliases[commandOrAlias] || commandOrAlias;
    }
    isAlias(name) {
        const aliases = this.getAliases();
        return name in aliases;
    }
}
exports.AliasManager = AliasManager;
