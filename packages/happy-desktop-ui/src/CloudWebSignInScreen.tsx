import { Box } from "./Box";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { TextField } from "./TextField";

export interface CloudWebSignInScreenProps {
    /**
     * Test-account sign-in, revealed by pressing the screen ten times in a
     * row, as on the desktop's Happy Cloud welcome. Absent, nothing of it is
     * drawn or announced.
     */
    readonly testSignIn?: {
        readonly login: string;
        readonly password: string;
        readonly busy?: boolean;
        readonly error?: string;
    };
    onSignIn(): void;
    /** A press anywhere but a control; ten in a row reveal the test sign-in. */
    onScreenPress(): void;
    onTestLoginChange(login: string): void;
    onTestPasswordChange(password: string): void;
    onTestSignIn(): void;
}

/**
 * The whole page of the Happy Cloud web app while it has no sign-in: on a
 * first visit, or once a sign-in ended and the page's data was erased.
 */
export function CloudWebSignInScreen(props: CloudWebSignInScreenProps) {
    const test = props.testSignIn;
    return (
        <Box
            className="happy-cloud-web-sign-in"
            data-happy-desktop-ui="cloud-web-sign-in"
            data-testid="cloud-web-signed-out"
            onClick={(event) => {
                if (!(event.target as Element).closest("button, input")) props.onScreenPress();
            }}
        >
            <EmptyState
                action={{ label: "Sign in", onClick: props.onSignIn }}
                description="Sign in to see this server’s work."
                icon="lock"
                size="panel"
                title="Sign in required"
            />
            {test ? (
                <Box className="happy-cloud-web-sign-in__test">
                    <TextField
                        aria-label="Login"
                        autoFocus
                        disabled={test.busy}
                        fullWidth
                        onSubmit={props.onTestSignIn}
                        onValueChange={props.onTestLoginChange}
                        placeholder="Login"
                        value={test.login}
                    />
                    <TextField
                        aria-label="Password"
                        autoComplete="off"
                        disabled={test.busy}
                        fullWidth
                        onSubmit={props.onTestSignIn}
                        onValueChange={props.onTestPasswordChange}
                        placeholder="Password"
                        type="password"
                        value={test.password}
                    />
                    <p
                        className="happy-cloud-web-sign-in__error"
                        data-tone={test.error ? "attention" : undefined}
                        role="status"
                    >
                        {test.error}
                    </p>
                    <Button
                        disabled={test.login.trim() === "" || test.password === ""}
                        fullWidth
                        loading={test.busy}
                        onClick={props.onTestSignIn}
                        variant="secondary"
                    >
                        Sign in with a test account
                    </Button>
                </Box>
            ) : null}
        </Box>
    );
}
