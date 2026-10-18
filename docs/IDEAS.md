1) SpillTrace — find where to test next to track down water pollution
The idea: A conservation team finds contaminated water downstream. Your app helps them narrow down where it entered the river—and tells them which water sample would be most useful next.
Tracing pollution through drainage networks is part of established discharge-investigation practice. Your contribution would be turning that process into an interactive decision tool. nepis.epa.gov
How it works
A map shows a river and its branches, possible entry points, and collected samples. Each time someone adds a positive or negative test result, the app updates the candidate locations.
Then it recommends the next sampling location based on how much uncertainty that test could eliminate.
The interesting feature is the explanation: “Testing here helps distinguish between these two upstream branches.”
The demo that could win
Start with a simulated river containing 12 possible entry points.
1. Add a positive sample downstream. Several impossible locations fade out.
2. The app highlights the most informative place to test next.
3. Enter a negative result there. An entire branch is eliminated.
4. The map recommends the next test and shows the remaining search area.
Let a judge choose a different sampling location and compare how much the two tests would narrow the search.
Your seven-hour MVP
- One prepared river network with roughly 15–20 nodes.
- Positive and negative sample inputs.
- Candidate-source scoring and next-sample selection.
- An interactive map with a measurement history.
Technical core: Graph traversal, probability updates, and information gain. The algorithm makes the sampling decision.
Keep the scope credible: Demonstrate one continuous pollution source in a simplified river network. Label the scenario and readings as simulated; the inference runs live. Real contaminant transport and multiple simultaneous sources would be later work.
Why I like it: It gives you an unusually strong technical story: helping people make better measurements with limited resources.
2) EchoGuard — turn a spare phone into a forest disturbance monitor
The idea: A phone or laptop listens for sustained sounds such as chainsaws or heavy machinery, saves a short evidence clip, and puts the event into a conservation team’s review queue.
You can use an existing audio model: Google’s YAMNet includes a chainsaw class, so this does not require training a model during the hackathon. tensorflow.org
How it works
The app processes short windows of microphone audio. It looks for repeated evidence across several windows, then creates an event containing:
- The detected sound and model score.
- The reporting device’s location.
- When it happened and how long it lasted.
- A playable audio clip.
The dashboard groups repeated observations so a sustained event produces one useful incident record.
The demo that could win
Have a teammate play forest ambience from their phone beside your laptop. The dashboard remains quiet.
Then they play a chainsaw recording. Your actual microphone captures it, the spectrogram changes, and an event appears with audio evidence.
Play a brief noise and then a sustained recording to demonstrate how your event logic handles them differently.
Your seven-hour MVP
- One working microphone input.
- One pretrained sound model.
- One or two event categories.
- Detection over consecutive audio windows.
- An incident list, evidence playback, and a sensor-location map.
Technical core: Live audio inference plus event detection over time.
First checkpoint: Get reliable detection on several recordings within the first 45 minutes. That resolves the biggest build risk early.
Keep the claims precise: You’re detecting sounds that deserve review. A machinery sound alone cannot establish that an activity is illegal, and the map shows the microphone’s location.
Why I like it: This has the strongest live AI demonstration of the six. Judges can hear the input and watch the system react.
3) Patchwork — reconnect isolated wildlife habitats with a limited budget
The idea: Help a neighborhood or conservation group decide where a few small habitat projects would make the biggest difference to connectivity.
Disconnected habitat can make it harder for pollinators to reach breeding sites and suitable habitat. Connected habitat corridors are an established conservation approach. U.S. Fish & Wildlife Service
How it works
A map contains existing green spaces and a set of possible garden sites. The user selects a budget and a movement-distance assumption for the modeled pollinator.
Your app chooses a combination of sites that connects the most existing habitat under those assumptions.
The interesting part is that two smaller, strategically placed gardens might connect areas that one large garden cannot.
The demo that could win
Show three disconnected clusters of green space.
Give the system a budget for two gardens. It places them, and a connected path lights up across the neighborhood.
Then a judge marks one parcel unavailable. The system finds a different combination—or shows that the remaining budget cannot achieve the same connection.
Your seven-hour MVP
- One neighborhood map.
- Existing habitat patches and 10–15 candidate sites.
- Adjustable budget and movement-distance assumptions.
- A site-selection algorithm.
- A clear before-and-after connectivity view.
Technical core: Graph connectivity and constrained search. With a small candidate set, you can evaluate combinations directly.
Keep the scope credible: Report connectivity under your stated assumptions. A prototype cannot establish actual population recovery.
Why I like it: It has a clear environmental purpose, a satisfying visual transformation, and relatively few dependencies that could derail your build.

maybe like something about recycling precious minerals and scanning trash yards or something like that
