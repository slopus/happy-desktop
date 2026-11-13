import type {
    HappyAgentPluginAuthMethod,
    HappyAgentPluginImage,
    HappyAgentPluginInstallation,
} from "happy-desktop-state";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import {
    HappyAgentPluginSetup,
    type HappyAgentPluginPageProps,
} from "./pages/plugins/HappyAgentPluginPage";
import { PluginMark } from "./pages/plugins/pluginPresentation";

export interface CloudOnboardingPluginDialogProps {
    readonly name: string;
    readonly description: string;
    readonly image: HappyAgentPluginImage | null;
    readonly installation: HappyAgentPluginInstallation;
    readonly methods: readonly HappyAgentPluginAuthMethod[];
    readonly onConfigure: HappyAgentPluginPageProps["onConfigure"];
    readonly onConnect: HappyAgentPluginPageProps["onConnect"];
    readonly onClose: () => void;
}

/**
 * C-346 CloudOnboardingPluginDialog — signs a plugin in without leaving
 * onboarding: the same fields or OAuth form as the plugin's own page, over the
 * plugins step, so a plugin that asks for a token is finished where it is
 * required.
 */
export function CloudOnboardingPluginDialog(props: CloudOnboardingPluginDialogProps) {
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className="happy-cloud-onboarding-plugin"
                data-testid="cloud-onboarding-plugin-dialog"
                onClose={props.onClose}
                title={`Connect ${props.name}`}
            >
                <div className="happy-cloud-onboarding-plugin__body">
                    <div className="happy-cloud-onboarding-plugin__summary">
                        <PluginMark image={props.image} size="row" />
                        <p className="happy-cloud-onboarding-plugin__description">
                            {props.description}
                        </p>
                    </div>
                    <HappyAgentPluginSetup
                        installation={props.installation}
                        methods={props.methods}
                        onConfigure={props.onConfigure}
                        onConnect={props.onConnect}
                    />
                </div>
            </Modal>
        </ModalOverlay>
    );
}
