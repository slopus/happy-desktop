import { HappySocialPage, type HappySocialPerson } from "../../src/HappySocialPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-255";

const ada: HappySocialPerson = {
    firstName: "Ada",
    lastName: "Lovelace",
    username: "ada",
};
const grace: HappySocialPerson = {
    firstName: "Grace",
    lastName: "Hopper",
    username: "grace",
};
const alan: HappySocialPerson = {
    firstName: "Alan",
    lastName: "Turing",
    username: "alan",
};

const actions = {
    onFriendRequestAccept: () => undefined,
    onFriendRequestReject: () => undefined,
    onFriendRequestSend: () => undefined,
    onFriendUsernameChange: () => undefined,
    onTeamCreate: () => undefined,
    onTeamCreateClose: () => undefined,
    onTeamCreateOpen: () => undefined,
    onTeamNameChange: () => undefined,
};

export function HappySocialBlueprintPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Happy Social teams, friends, requests, and their create and username forms."
            title="HappySocialPage"
        >
            <FullScreenSpecimen
                detail="720 × 480 minimum window · populated"
                label="Friends and requests"
                number={componentNumber}
            >
                <HappySocialPage
                    {...actions}
                    friendUsername=""
                    friends={[ada, grace]}
                    incomingRequests={[alan]}
                    outgoingRequests={[
                        { firstName: "Katherine", lastName: "Johnson", username: "katherine" },
                    ]}
                    status="ready"
                    teamCreateOpen={false}
                    teamName=""
                    teams={[
                        { id: "org_analytical", name: "Analytical Engines" },
                        { id: "org_compilers", name: "Compiler Guild" },
                    ]}
                    teamsAvailable
                    teamsStatus="ready"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="720 × 480 minimum window · empty"
                label="New social profile"
                number={componentNumber}
            >
                <HappySocialPage
                    {...actions}
                    friendUsername="ada"
                    friends={[]}
                    incomingRequests={[]}
                    outgoingRequests={[]}
                    status="ready"
                    teamCreateOpen={false}
                    teamName=""
                    teams={[]}
                    teamsAvailable
                    teamsStatus="ready"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="720 × 480 minimum window · create team dialog"
                label="New team"
                number={componentNumber}
            >
                <div
                    style={{
                        display: "flex",
                        position: "relative",
                        transform: "translateZ(0)",
                    }}
                >
                    <HappySocialPage
                        {...actions}
                        friendUsername=""
                        friends={[ada]}
                        incomingRequests={[]}
                        outgoingRequests={[]}
                        status="ready"
                        teamCreateOpen
                        teamName="Research"
                        teams={[{ id: "org_analytical", name: "Analytical Engines" }]}
                        teamsAvailable
                        teamsStatus="ready"
                    />
                </div>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
