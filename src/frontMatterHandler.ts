import { MetadataCache, TFile, Vault } from "obsidian";

export class FrontMatterHandler {
    metadataCache: MetadataCache;
    file: TFile;
    vault: Vault;

    frontMatter: Record<string, string> = {};

    constructor(vault: Vault, metadataCache: MetadataCache, file: TFile) {
        this.metadataCache = metadataCache;
        this.vault = vault;
        this.file = file;
    }

    set(key: string, value: string): FrontMatterHandler {
        this.frontMatter[key] = value;
        return this;
    }

    remove(key: string): FrontMatterHandler {
        if (key in this.frontMatter) {
            delete this.frontMatter[key];
        }
        return this;
    }

    get(key: string, defaultValue = ""): string {
        return this.currentFrontMatter()[key] ?? defaultValue;
    }

    async apply(): Promise<void> {
        const newFrontMatter = this.currentFrontMatter();

        const content = await this.vault.cachedRead(this.file);
        const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;

        const yaml = this.frontMatterToYaml(newFrontMatter);
        
        let newContent = "";
        if (content.match(frontmatterRegex)) {
            newContent = content.replace(frontmatterRegex, (match) => {
                return yaml;
            });
        } else {
            newContent = `${yaml}\n${content}`;
        }

        await this.vault.modify(this.file, newContent);
    }

    private frontMatterToYaml(frontMatter: Record<string, string>) {
        if(Object.keys(frontMatter).length === 0) {
            return "";
        }

        let yaml = "---\n";
        for (const key of Object.keys(frontMatter)) {
            yaml += `${key}: ${frontMatter[key]}\n`;
        }
        yaml += "---";
        return yaml;

    }

    private currentFrontMatter() {
        const currentFrontMatter = {
            ...this.metadataCache.getCache(this.file?.path)?.frontmatter,
            ...this.frontMatter
        }

        delete currentFrontMatter["position"]

        return currentFrontMatter
    }

}