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

Build a Sustainable Future
1) Reforge — design something useful around the materials you already have
This is my first choice for you personally.
The idea: A workshop, contractor, or community garden has leftover wood in awkward lengths. Reforge takes that inventory and creates a usable design with an exact cutting plan.
EPA identifies material reuse and designing to reduce construction waste as ways to conserve resources. Your project would make that actionable for someone standing in front of a pile of offcuts. US EPA
How it works
The user enters their measured board lengths and chooses a project—for the hackathon, one adjustable planter design.
The system determines:
- Which planter dimensions fit the available material.
- Which parts come from each board.
- How much material the saw cuts consume.
- What reusable offcuts remain.
- Whether any additional wood is needed.
It returns a labeled cutting diagram and an assembly preview.
The demo that could win
Put a few cardboard strips or measured wood offcuts on the table.
Enter their lengths. Reforge produces a planter design, and its component pieces animate into their assigned positions on the stock boards.
Then tell a judge: “Remove any board.”
Remove it from the inventory. The app recalculates the design and cutting plan. It either finds another feasible arrangement, adjusts the planter within the allowed size range, or identifies the extra stock required.
That interaction demonstrates whether the product actually works.
Your seven-hour MVP
- One planter design with adjustable dimensions.
- Boards of one shared width and thickness.
- Manually entered, measured lengths.
- A cutting optimizer that accounts for saw-cut width.
- SVG cutting diagrams and a simple assembly view.
Technical core: Search across allowed design dimensions, then solve the cutting-stock problem. Prioritize reducing new material purchases, followed by reducing unusable waste.
Useful measured outputs: Material utilization, new wood required, number of cuts, and remaining offcuts—all calculated from the generated plan.
Why I like it for you: Your construction experience gives you a practical understanding of the problem. You can explain who would use it, challenge the generated plan, and present a tangible result.
Treat photo recognition as an optional extra. Confirmed measurements give you a reliable core product immediately.


GridWeave — make an electric school-bus fleet fit its available power
The idea: A school wants to run electric buses, but charging every bus immediately would exceed the depot’s electrical capacity. Your app figures out whether the buses can all be ready on time using the connection the school already has.
Managed charging is a real research and deployment problem; studies of school-bus electrification examine how charging schedules affect depot demand. National Laboratory of the Rockies
How it works
For each bus, enter:
- When it arrives.
- When it must depart.
- How much energy it needs.
- Its maximum charging rate.
Then specify the depot’s total power limit. The system schedules charging so vehicles meet their departure requirements while respecting that limit.
If it cannot meet every requirement, it identifies the shortfall.
The demo that could win
Start with a prepared scenario where every bus begins charging upon arrival. The power-demand graph crosses the depot’s limit and turns red.
Click “Optimize.” Charging shifts across the available time windows. The graph stays below the limit, and every bus meets its departure requirement.
Then let a judge move one departure earlier. The system recalculates—or clearly shows why the new request is infeasible.
Your seven-hour MVP
- Five buses.
- One day of scheduling.
- An adjustable depot power cap.
- A charging timeline and power-demand chart.
- A comparison with immediate charging.
Technical core: Linear or constraint optimization. OR-Tools provides existing optimization tools for scheduling and related resource-allocation problems. developers.google.com
Optional extra: Add a supplied solar-generation curve after the main scheduling flow works.
Why I like it: It answers a concrete sustainability question with a result you can verify. Showing an infeasible case correctly would also make the technical work more convincing.