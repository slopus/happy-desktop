import { useState } from "react";
import { Box } from "./Box";
import { Button } from "./Button";
import { TextField, type TextFieldProps } from "./TextField";

export type SecretValueFieldProps = Omit<TextFieldProps, "type"> & {
    /** Starts with the value shown, for fixtures; a person always starts with it hidden. */
    readonly initialShown?: boolean;
};

/**
 * A write-only value being typed, hidden until the person shows it. A single
 * line hides as a password; several lines stay a textarea masked by CSS, so a
 * pasted key or certificate keeps its line breaks. Showing or hiding never
 * touches the value.
 */
export function SecretValueField(props: SecretValueFieldProps) {
    const { initialShown, ...field } = props;
    const [shown, setShown] = useState(initialShown ?? false);
    return (
        <Box
            className="happy-secret-value-field"
            data-happy-desktop-ui="secret-value-field"
            data-labelled={field.label ? "" : undefined}
            data-shown={shown ? "" : undefined}
        >
            <TextField {...field} type={field.multiline || shown ? "text" : "password"} />
            <Box className="happy-secret-value-field__toggle">
                <Button
                    aria-label={shown ? "Hide value" : "Show value"}
                    aria-pressed={shown}
                    disabled={field.disabled}
                    icon={shown ? "eye-off" : "eye"}
                    iconOnly
                    onClick={() => setShown(!shown)}
                    size="medium"
                    variant="ghost"
                />
            </Box>
        </Box>
    );
}
